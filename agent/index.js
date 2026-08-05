import express from 'express';
import http from 'http';
import { WebSocketServer } from 'ws';
import cors from 'cors';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { exec } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = process.env.AGENT_PORT || 6129;
const AGENT_VERSION = "DameWare MRC Agent v12.2 Equivalent";

const app = express();
app.use(cors());
app.use(express.json({ limit: '50mb' }));

// Agent state
let isInputLocked = false;
let isScreenBlackedOut = false;
let activeSession = null;
let chatMessages = [];

// Helper: Run PowerShell command
function runPowerShell(cmd) {
  return new Promise((resolve) => {
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -Command "${cmd.replace(/"/g, '\\"')}"`, (err, stdout, stderr) => {
      if (err) resolve({ success: false, error: stderr || err.message });
      else resolve({ success: true, output: stdout.trim() });
    });
  });
}

// Windows GDI Screen Capture Script
const captureScriptPath = path.join(__dirname, 'capture.ps1');
const psCaptureCode = `
Add-Type -AssemblyName System.Windows.Forms
Add-Type -AssemblyName System.Drawing

$screen = [System.Windows.Forms.Screen]::PrimaryScreen
$bounds = $screen.Bounds
$bitmap = New-Object System.Drawing.Bitmap $bounds.Width, $bounds.Height
$graphics = [System.Drawing.Graphics]::FromImage($bitmap)
$graphics.CopyFromScreen($bounds.Location, [System.Drawing.Point]::Empty, $bounds.Size)

$ms = New-Object System.IO.MemoryStream
$bitmap.Save($ms, [System.Drawing.Imaging.ImageFormat]::Jpeg)
$bytes = $ms.ToArray()
$base64 = [Convert]::ToBase64String($bytes)

$graphics.Dispose()
$bitmap.Dispose()
$ms.Dispose()

Write-Output $base64
`;

if (!fs.existsSync(path.dirname(captureScriptPath))) {
  fs.mkdirSync(path.dirname(captureScriptPath), { recursive: true });
}
fs.writeFileSync(captureScriptPath, psCaptureCode);

// Screen capture handler
async function captureScreenBase64() {
  return new Promise((resolve) => {
    exec(`powershell -NoProfile -ExecutionPolicy Bypass -File "${captureScriptPath}"`, { maxBuffer: 10 * 1024 * 1024 }, (err, stdout) => {
      if (err || !stdout) {
        resolve(null);
      } else {
        resolve(stdout.trim());
      }
    });
  });
}

// Mouse Input Injection
async function injectMouseInput(action, xPercent, yPercent, button) {
  if (isInputLocked) return { success: false, reason: "Input is locked by administrator" };

  const script = `
  Add-Type -TypeDefinition @"
  using System;
  using System.Runtime.InteropServices;
  public class MouseInput {
      [DllImport("user32.dll")]
      public static extern bool SetCursorPos(int X, int Y);
      [DllImport("user32.dll")]
      public static extern void mouse_event(uint dwFlags, uint dx, uint dy, uint dwData, int dwExtraInfo);
  }
"@
  Add-Type -AssemblyName System.Windows.Forms
  $screen = [System.Windows.Forms.Screen]::PrimaryScreen
  $targetX = [int]($screen.Bounds.Width * ${xPercent})
  $targetY = [int]($screen.Bounds.Height * ${yPercent})
  
  [MouseInput]::SetCursorPos($targetX, $targetY)

  if ("${action}" -eq "click") {
      if ("${button}" -eq "right") {
          [MouseInput]::mouse_event(0x0008, 0, 0, 0, 0)
          [MouseInput]::mouse_event(0x0010, 0, 0, 0, 0)
      } else {
          [MouseInput]::mouse_event(0x0002, 0, 0, 0, 0)
          [MouseInput]::mouse_event(0x0004, 0, 0, 0, 0)
      }
  }
  `;
  return runPowerShell(script);
}

// Keyboard Input Injection
async function injectKeyboardInput(key, modifiers = []) {
  if (isInputLocked) return { success: false, reason: "Input is locked by administrator" };

  if (key === 'CAD') {
    return runPowerShell(`Start-Process taskmgr.exe`);
  }
  if (key === 'WIN_L') {
    return runPowerShell(`rundll32.exe user32.dll,LockWorkStation`);
  }

  let keysStr = "";
  if (modifiers.includes('Ctrl')) keysStr += "^";
  if (modifiers.includes('Alt')) keysStr += "%";
  if (modifiers.includes('Shift')) keysStr += "+";
  
  if (key.length === 1) {
    keysStr += key.toLowerCase();
  } else if (key === 'Enter') {
    keysStr += "{ENTER}";
  } else {
    keysStr += `{${key.toUpperCase()}}`;
  }

  const script = `
  $wshell = New-Object -ComObject wscript.shell
  $wshell.SendKeys('${keysStr}')
  `;
  return runPowerShell(script);
}

// Agent APIs
app.get('/api/status', (req, res) => {
  res.json({
    status: 'ONLINE',
    agentVersion: AGENT_VERSION,
    port: PORT,
    hostname: os.hostname(),
    platform: os.platform(),
    arch: os.arch(),
    totalMemoryGB: (os.totalmem() / (1024 ** 3)).toFixed(2),
    freeMemoryGB: (os.freemem() / (1024 ** 3)).toFixed(2),
    cpus: os.cpus().length,
    currentUser: os.userInfo().username
  });
});

app.post('/api/controls/lock-input', (req, res) => {
  isInputLocked = req.body.locked;
  res.json({ success: true, isInputLocked });
});

app.post('/api/controls/blackout-screen', (req, res) => {
  isScreenBlackedOut = req.body.blackout;
  res.json({ success: true, isScreenBlackedOut });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws) => {
  console.log('[DameWare Agent] Remote console client connected');

  ws.send(JSON.stringify({
    type: 'HANDSHAKE_ACK',
    agentVersion: AGENT_VERSION,
    hostname: os.hostname(),
    user: os.userInfo().username,
    os: `${os.type()} ${os.release()}`
  }));

  const streamInterval = setInterval(async () => {
    if (ws.readyState === ws.OPEN) {
      if (isScreenBlackedOut) {
        ws.send(JSON.stringify({ type: 'SCREEN_FRAME', blackedOut: true }));
      } else {
        const frameData = await captureScreenBase64();
        if (frameData) {
          ws.send(JSON.stringify({
            type: 'SCREEN_FRAME',
            frame: frameData,
            timestamp: Date.now(),
            width: 1920,
            height: 1080
          }));
        }
      }
    }
  }, 100);

  ws.on('message', async (message) => {
    try {
      const data = JSON.parse(message);
      if (data.type === 'MOUSE_INPUT') {
        await injectMouseInput(data.action, data.xPercent, data.yPercent, data.button);
      } else if (data.type === 'KEYBOARD_INPUT') {
        await injectKeyboardInput(data.key, data.modifiers || []);
      } else if (data.type === 'CHAT_MESSAGE') {
        chatMessages.push({ sender: 'Technician', text: data.text, time: new Date().toLocaleTimeString() });
        wss.clients.forEach(client => {
          if (client.readyState === ws.OPEN) {
            client.send(JSON.stringify({ type: 'CHAT_BROADCAST', messages: chatMessages }));
          }
        });
      }
    } catch (e) {
      console.error('Error handling WebSocket message:', e);
    }
  });

  ws.on('close', () => {
    console.log('[DameWare Agent] Client disconnected');
    clearInterval(streamInterval);
  });
});

server.listen(PORT, () => {
  console.log(`[DameWare Agent] Running on port ${PORT}`);
});
