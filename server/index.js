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

  console.log(`[Gateway] Single Active Session: Connecting to ${targetHost}:${targetPort}...`);

  let isConnected = false;
  let isCancelled = false;
  let tcpClient = new net.Socket();
  let buffer = '';

  tcpClient.setTimeout(4000);

  tcpClient.connect(targetPort, targetHost, () => {
    if (isCancelled) {
      tcpClient.destroy();
      return;
    }
    isConnected = true;
    console.log(`[Gateway] Active TCP session established with ${targetHost}:${targetPort}`);
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

  tcpClient.on('timeout', () => {
    if (!isConnected && !isCancelled) {
      console.log(`[Gateway] Connection timeout for ${targetHost}:${targetPort}`);
      sendErrorToConsole(ws, 'ERR_CONNECTION_TIMED_OUT', `Connecting to ${targetHost}:${targetPort} timed out. Verify target IP and Firewall Port 6129.`);
      tcpClient.destroy();
    }
  });

  tcpClient.on('error', (err) => {
    if (!isConnected && !isCancelled) {
      console.log(`[Gateway] Connection error for ${targetHost}:${targetPort}: ${err.message}`);
      let code = 'ERR_CONNECTION_FAILED';
      if (err.code === 'ECONNREFUSED') code = 'ERR_CONNECTION_REFUSED';
      if (err.code === 'ENOTFOUND') code = 'ERR_HOST_NOT_FOUND';
      if (err.code === 'ETIMEDOUT') code = 'ERR_CONNECTION_TIMED_OUT';

      sendErrorToConsole(ws, code, `Unable to connect to ${targetHost}:${targetPort} (${err.message}). Make sure DameWare_Agent.exe is running on the target machine.`);
    }
  });

  tcpClient.on('close', () => {
    if (isConnected && ws.readyState === WebSocket.OPEN && !isCancelled) {
      ws.close();
    }
  });

  ws.on('message', (message) => {
    if (isConnected && tcpClient.writable && !isCancelled) {
      tcpClient.write(message.toString() + '\n');
    }
  });

  ws.on('close', () => {
    isCancelled = true;
    tcpClient.destroy();
  });
});

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
