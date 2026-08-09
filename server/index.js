import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import cors from 'cors';
import net from 'net';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';
import { pushDeployAgent } from './deployer.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname  = path.dirname(__filename);

const PORT = process.env.PORT || 3001;
const app = express();
app.use(cors());
app.use(express.json());
// EXE ve diger public dosyalari HTTP ile sun
app.use(express.static(path.join(__dirname, '..', 'public')));

app.get('/api/health', (req, res) => {
  res.json({ status: 'OK', service: 'DameWare Console Gateway', port: PORT });
});

// Uzak makine icin kurulum komutu uret
app.get('/api/setup-command', (req, res) => {
  const port = req.query.port || 6129;
  // Bu sunucunun LAN IP'sini bul
  const ifaces = os.networkInterfaces();
  let localIp = '127.0.0.1';
  for (const iface of Object.values(ifaces)) {
    for (const alias of iface) {
      if (alias.family === 'IPv4' && !alias.internal) {
        localIp = alias.address;
        break;
      }
    }
    if (localIp !== '127.0.0.1') break;
  }

  const downloadUrl = `http://${localIp}:3001/RemoteMM_Agent.exe`;
  const cmd = `New-Item C:\\RemoteMM -ItemType Directory -Force | Out-Null; Stop-Process -Name RemoteMM_Agent -Force -ErrorAction SilentlyContinue; Invoke-WebRequest '${downloadUrl}' -OutFile C:\\RemoteMM\\RemoteMM_Agent.exe -UseBasicParsing; netsh advfirewall firewall add rule name=RemoteMMAgent dir=in action=allow protocol=TCP localport=${port} 2>$null; schtasks /delete /tn RemoteMMAgent /f 2>$null; schtasks /create /tn RemoteMMAgent /tr 'C:\\RemoteMM\\RemoteMM_Agent.exe' /ru 'SYSTEM' /sc ONSTART /rl HIGHEST /f; schtasks /run /tn RemoteMMAgent`;

  res.json({ cmd, downloadUrl, serverIp: localIp });
});

app.post('/api/agent/deploy', async (req, res) => {
  const { targetHost, domain, username, password, port } = req.body;
  try {
    const result = await pushDeployAgent({ targetHost, domain, username, password, port });
    res.json(result);
  } catch (err) {
    res.status(500).json({ success: false, error: err.message });
  }
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server });

wss.on('connection', (ws, req) => {
  const params = new URLSearchParams(req.url.replace('/?', ''));
  const targetHost = params.get('host') || '127.0.0.1';
  const targetPort = parseInt(params.get('port') || '6129', 10);
  const domain = params.get('domain') || 'WORKGROUP';
  const username = params.get('username') || 'Administrator';
  const password = params.get('password') || '';

  console.log(`[Gateway] Initiating session to ${targetHost}:${targetPort}...`);

  let isConnected = false;
  let isCancelled = false;
  let hasAttemptedPush = false;
  let tcpClient = new net.Socket();
  let buffer = '';

  const tryConnect = () => {
    if (isCancelled) return;

    tcpClient = new net.Socket();
    tcpClient.setTimeout(3500);

    tcpClient.connect(targetPort, targetHost, () => {
      if (isCancelled) {
        tcpClient.destroy();
        return;
      }
      isConnected = true;
      console.log(`[Gateway] Connected directly to Agent on ${targetHost}:${targetPort}`);
    });

    tcpClient.on('data', (chunk) => {
      if (isCancelled) return;
      buffer += chunk.toString('utf8');
      let lines = buffer.split('\n');
      buffer = lines.pop();

      for (let line of lines) {
        if (line.trim() && ws.readyState === WebSocket.OPEN && !isCancelled) {
          ws.send(line.trim());
        }
      }
    });

    tcpClient.on('timeout', handleConnectionFailure);
    tcpClient.on('error', handleConnectionFailure);

    tcpClient.on('close', () => {
      if (isConnected && ws.readyState === WebSocket.OPEN && !isCancelled) {
        ws.close();
      }
    });
  };

  const handleConnectionFailure = async (err) => {
    if (isConnected || isCancelled) return;
    tcpClient.destroy();

    // AUTOMATIC AGENT PUSH DEPLOYMENT IF PORT IS CLOSED & NOT YET ATTEMPTED
    if (!hasAttemptedPush) {
      hasAttemptedPush = true;
      console.log(`[Gateway] Agent port ${targetPort} unreachable on ${targetHost}. Launching Automatic Remote Push Deployment...`);

      sendProgressToConsole(ws, `Agent port ${targetPort} closed. Automatically pushing and launching DameWare_Agent.exe on ${targetHost}...`);

      try {
        await pushDeployAgent({
          targetHost,
          domain,
          username,
          password,
          port: targetPort,
          onProgress: (msg) => sendProgressToConsole(ws, msg)
        });

        console.log(`[Gateway] Push Deployment completed. Retrying direct TCP connection to ${targetHost}:${targetPort}...`);
        sendProgressToConsole(ws, `Agent launched! Connecting to remote screen...`);

        setTimeout(() => {
          if (!isCancelled) tryConnect();
        }, 1500);
        return;
      } catch (deployErr) {
        console.log(`[Gateway] Push Deployment notice: ${deployErr.message}`);
      }
    }

    // If already attempted push or push failed, return crisp error
    let code = 'ERR_CONNECTION_FAILED';
    if (err && err.code === 'ECONNREFUSED') code = 'ERR_CONNECTION_REFUSED';
    if (err && err.code === 'ENOTFOUND') code = 'ERR_HOST_NOT_FOUND';
    if (err && err.code === 'ETIMEDOUT') code = 'ERR_CONNECTION_TIMED_OUT';

    sendErrorToConsole(ws, code, `Unable to connect to ${targetHost}:${targetPort}. Verify target IP and Firewall port 6129.`);
  };

  ws.on('message', (message) => {
    if (isConnected && tcpClient.writable && !isCancelled) {
      tcpClient.write(message.toString() + '\n');
    }
  });

  ws.onclose = () => {
    isCancelled = true;
    tcpClient.destroy();
  };

  // Start initial probe
  tryConnect();
});

function sendProgressToConsole(ws, message) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'DEPLOYMENT_PROGRESS',
      message,
      timestamp: Date.now()
    }));
  }
}

function sendErrorToConsole(ws, errorCode, errorMessage) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify({
      type: 'CONNECTION_ERROR',
      errorCode,
      errorMessage,
      timestamp: Date.now()
    }));
  }
}

server.listen(PORT, () => {
  console.log(`[Gateway Server] DameWare Console Gateway listening on port ${PORT}`);
});
