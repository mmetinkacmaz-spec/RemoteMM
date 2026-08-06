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

// Automatic Remote Push Deployer API Endpoint
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

  console.log(`[Gateway] Console requesting connection to Agent TCP on ${targetHost}:${targetPort}...`);

  let isConnected = false;
  let tcpClient = new net.Socket();
  let buffer = '';

  // Set 5-second timeout for rapid error reporting
  tcpClient.setTimeout(5000);

  tcpClient.connect(targetPort, targetHost, () => {
    isConnected = true;
    console.log(`[Gateway] Successfully connected to Agent on ${targetHost}:${targetPort}`);
  });

  tcpClient.on('data', (chunk) => {
    buffer += chunk.toString('utf8');
    let lines = buffer.split('\n');
    buffer = lines.pop(); // Retain incomplete chunk

    for (let line of lines) {
      if (line.trim() && ws.readyState === WebSocket.OPEN) {
        ws.send(line.trim());
      }
    }
  });

  tcpClient.on('timeout', () => {
    if (!isConnected) {
      console.log(`[Gateway] Connection timed out for ${targetHost}:${targetPort}`);
      sendErrorToConsole(ws, 'ERR_CONNECTION_TIMED_OUT', `Connecting to ${targetHost}:${targetPort} timed out. Verify target IP and Firewall Port 6129.`);
      tcpClient.destroy();
    }
  });

  tcpClient.on('error', (err) => {
    if (!isConnected) {
      console.log(`[Gateway] Connection error for ${targetHost}:${targetPort}: ${err.message}`);
      let code = 'ERR_CONNECTION_FAILED';
      if (err.code === 'ECONNREFUSED') code = 'ERR_CONNECTION_REFUSED';
      if (err.code === 'ENOTFOUND') code = 'ERR_HOST_NOT_FOUND';
      if (err.code === 'ETIMEDOUT') code = 'ERR_CONNECTION_TIMED_OUT';

      sendErrorToConsole(ws, code, `Unable to connect to ${targetHost}:${targetPort} (${err.message}). Make sure DameWare_Agent.exe is running on the target machine.`);
    }
  });

  tcpClient.on('close', () => {
    if (isConnected && ws.readyState === WebSocket.OPEN) {
      ws.close();
    }
  });

  // Forward Console commands to Agent
  ws.on('message', (message) => {
    if (isConnected && tcpClient.writable) {
      tcpClient.write(message.toString() + '\n');
    }
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
