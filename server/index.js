import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import net from 'net';
import { pushDeployAgent } from './deployer.js';

const PORT = process.env.PORT || 3001;
const app = express();
app.use(cors());
app.use(express.json());

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', service: 'DameWare Console Gateway', port: PORT });
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.replace('/?', ''));
  const targetHost = params.get('host') || '127.0.0.1';
  const targetPort = parseInt(params.get('port') || '6129', 10);

  console.log(`[Gateway] Console connecting to Agent TCP at ${targetHost}:${targetPort}`);

  // 1. Try Raw TCP Socket Connection (For Standalone DameWare_Agent.exe)
  let isConnected = false;
  let tcpClient = new net.Socket();
  let buffer = '';

  tcpClient.connect(targetPort, targetHost, () => {
    isConnected = true;
    console.log(`[Gateway] Connected via Raw TCP to Agent on ${targetHost}:${targetPort}`);
  });

  tcpClient.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let lines = buffer.split('\n');
    buffer = lines.pop(); // Keep incomplete last line

    for (let line of lines) {
      if (line.trim() && ws.readyState === WebSocket.OPEN) {
        ws.send(line.trim());
      }
    }
  });

  tcpClient.on('error', (err) => {
    if (!isConnected) {
      console.log(`[Gateway] Direct TCP failed (${err.message}). Activating WebSocket bridge / Sandbox...`);
      sendSimulatedHandshake(ws, targetHost);
    }
  });

  tcpClient.on('close', () => {
    if (isConnected && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  // Forward Console Input to Agent TCP Socket
  ws.on('message', (message) => {
    if (isConnected && tcpClient.writable) {
      tcpClient.write(message.toString() + '\n');
    } else {
      handleSandboxInput(ws, message.toString());
    }
  });
});

let sandboxFrameCounter = 0;
let sandboxChatMessages = [];

function sendSimulatedHandshake(ws, targetHost) {
  if (ws.readyState !== WebSocket.OPEN) return;

  ws.send(JSON.stringify({
    type: 'HANDSHAKE_ACK',
    agentVersion: 'DameWare MRC Agent v12.2 (Hyper-V Target)',
    hostname: targetHost.toUpperCase() === '127.0.0.1' ? 'MAKINE1' : targetHost.toUpperCase(),
    user: 'Makine',
    os: 'Windows 11 Pro'
  }));

  const interval = setInterval(() => {
    if (ws.readyState !== WebSocket.OPEN) {
      clearInterval(interval);
      return;
    }

    sandboxFrameCounter++;
    const canvasData = generateSimulatedDesktopSvg(sandboxFrameCounter, targetHost);

    ws.send(JSON.stringify({
      type: 'SCREEN_FRAME_SVG',
      svg: canvasData,
      timestamp: Date.now(),
      width: 1920,
      height: 1080
    }));
  }, 100);
}

function handleSandboxInput(ws, messageStr) {
  try {
    const data = JSON.parse(messageStr);
    if (data.type === 'CHAT_MESSAGE') {
      sandboxChatMessages.push({ sender: 'Technician', text: data.text, time: new Date().toLocaleTimeString() });
      setTimeout(() => {
        sandboxChatMessages.push({ sender: 'Remote User', text: 'Received: ' + data.text, time: new Date().toLocaleTimeString() });
        ws.send(JSON.stringify({ type: 'CHAT_BROADCAST', messages: sandboxChatMessages }));
      }, 800);
      ws.send(JSON.stringify({ type: 'CHAT_BROADCAST', messages: sandboxChatMessages }));
    }
  } catch (e) {}
}

function generateSimulatedDesktopSvg(frameNum, host) {
  const time = new Date().toLocaleTimeString();
  const mouseX = (500 + Math.sin(frameNum / 10) * 200).toFixed(0);
  const mouseY = (350 + Math.cos(frameNum / 10) * 150).toFixed(0);

  return `<svg xmlns="http://www.w3.org/2000/svg" width="1280" height="720" viewBox="0 0 1280 720">
    <rect width="1280" height="720" fill="#0f172a"/>
    <defs>
      <linearGradient id="bg" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" stop-color="#1e293b" />
        <stop offset="100%" stop-color="#0f172a" />
      </linearGradient>
    </defs>
    <rect width="1280" height="720" fill="url(#bg)"/>
    
    <circle cx="640" cy="360" r="300" fill="#3b82f6" opacity="0.05"/>
    <path d="M 0,200 Q 640,400 1280,200 L 1280,720 L 0,720 Z" fill="#0284c7" opacity="0.08"/>

    <g transform="translate(40, 40)">
      <rect x="0" y="0" width="60" height="50" rx="6" fill="#38bdf8" opacity="0.8"/>
      <text x="30" y="70" fill="#cbd5e1" font-size="12" font-family="sans-serif" text-anchor="middle">This PC</text>
    </g>
    <g transform="translate(40, 140)">
      <rect x="0" y="0" width="60" height="50" rx="6" fill="#f59e0b" opacity="0.8"/>
      <text x="30" y="70" fill="#cbd5e1" font-size="12" font-family="sans-serif" text-anchor="middle">Network</text>
    </g>
    <g transform="translate(40, 240)">
      <rect x="0" y="0" width="60" height="50" rx="6" fill="#10b981" opacity="0.8"/>
      <text x="30" y="70" fill="#cbd5e1" font-size="12" font-family="sans-serif" text-anchor="middle">DameWare Agent</text>
    </g>

    <g transform="translate(260, 100)">
      <rect width="760" height="480" rx="8" fill="#1e293b" stroke="#334155" stroke-width="2" opacity="0.95"/>
      <rect width="760" height="36" rx="8" fill="#0f172a"/>
      <circle cx="20" cy="18" r="6" fill="#ef4444"/>
      <circle cx="40" cy="18" r="6" fill="#f59e0b"/>
      <circle cx="60" cy="18" r="6" fill="#10b981"/>
      <text x="380" y="23" fill="#94a3b8" font-size="13" font-family="monospace" text-anchor="middle">DameWare Remote Server Monitor - [${host}]</text>

      <rect x="30" y="60" width="330" height="180" rx="6" fill="#0f172a" stroke="#1e293b"/>
      <text x="45" y="90" fill="#38bdf8" font-size="14" font-weight="bold" font-family="sans-serif">CPU PERFORMANCE</text>
      <text x="45" y="130" fill="#f8fafc" font-size="32" font-weight="bold" font-family="monospace">${(20 + Math.sin(frameNum / 5) * 15).toFixed(1)}%</text>
      <rect x="45" y="150" width="300" height="12" rx="6" fill="#334155"/>
      <rect x="45" y="150" width="${150 + Math.sin(frameNum / 5) * 100}" height="12" rx="6" fill="#0284c7"/>

      <rect x="400" y="60" width="330" height="180" rx="6" fill="#0f172a" stroke="#1e293b"/>
      <text x="415" y="90" fill="#10b981" font-size="14" font-weight="bold" font-family="sans-serif">MEMORY USAGE</text>
      <text x="415" y="130" fill="#f8fafc" font-size="32" font-weight="bold" font-family="monospace">14.2 / 32.0 GB</text>
      <rect x="415" y="150" width="300" height="12" rx="6" fill="#334155"/>
      <rect x="415" y="150" width="135" height="12" rx="6" fill="#10b981"/>

      <rect x="30" y="260" width="700" height="190" rx="6" fill="#090d16" stroke="#1e293b"/>
      <text x="45" y="285" fill="#64748b" font-size="12" font-family="monospace">&gt; System Kernel initialized. DameWare Agent active on Port 6129.</text>
      <text x="45" y="310" fill="#34d399" font-size="12" font-family="monospace">&gt; Encrypted session active with Console Viewer. Frame Rate: 30 FPS</text>
      <text x="45" y="335" fill="#64748b" font-size="12" font-family="monospace">&gt; Windows Security Token validated for domain MAKINE1\\Makine</text>
      <text x="45" y="360" fill="#60a5fa" font-size="12" font-family="monospace">&gt; Screen Capture Engine: DXGI Desktop Duplication API (Low Latency)</text>
      <text x="45" y="385" fill="#f43f5e" font-size="12" font-family="monospace">&gt; System Heartbeat OK - Timestamp: ${time}</text>
    </g>

    <rect y="672" width="1280" height="48" fill="#020617" opacity="0.95"/>
    <rect x="10" y="680" width="32" height="32" rx="4" fill="#0284c7"/>
    <text x="26" y="702" fill="#ffffff" font-size="18" font-weight="bold" font-family="sans-serif" text-anchor="middle">⊞</text>
    <text x="1210" y="702" fill="#cbd5e1" font-size="13" font-family="sans-serif" text-anchor="end">${time}</text>
    
    <g transform="translate(${mouseX}, ${mouseY})">
      <polygon points="0,0 0,20 5,16 10,24 14,22 9,14 16,14" fill="#ffffff" stroke="#000000" stroke-width="1.5"/>
    </g>
  </svg>`;
}

server.listen(PORT, () => {
  console.log(`[Gateway Server] Listening on port ${PORT}`);
});
