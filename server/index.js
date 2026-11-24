import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import cors from 'cors';

import { collectSystemMetrics } from './collectors/system.js';
import { collectNetworkRates } from './collectors/network.js';
import { collectActiveSockets } from './collectors/sockets.js';
import { generateSimulatedTelemetry } from './simulator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const PORT = parseInt(process.env.PORT || '7777', 10);
const IS_LINUX = os.platform() === 'linux';
let forceDemoMode = process.env.DEMO_MODE === 'true';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static build of frontend
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));

// VPS Node profile
const VPS_PROFILE = {
  ip: process.env.VPS_IP || '139.162.52.81',
  hostname: os.hostname(),
  city: 'Singapore',
  region: 'Singapore',
  country: 'SG',
  flag: '🇸🇬',
  ll: [1.2897, 103.8501],
  org: 'Akamai Connected Cloud / Linode 4TB',
  storageTier: '4 TB NVMe'
};

// REST API status endpoint
app.get('/api/status', (req, res) => {
  res.json({
    status: 'online',
    vps: VPS_PROFILE,
    platform: os.platform(),
    isLinux: IS_LINUX,
    demoMode: forceDemoMode,
    timestamp: Date.now()
  });
});

app.post('/api/toggle-demo', (req, res) => {
  forceDemoMode = !forceDemoMode;
  res.json({ demoMode: forceDemoMode });
});

// Single page application fallback
app.get('*', (req, res) => {
  res.sendFile(path.join(clientDist, 'index.html'));
});

const server = http.createServer(app);
const wss = new WebSocketServer({ server, path: '/ws' });

let connectedClients = 0;

wss.on('connection', (ws) => {
  connectedClients++;
  // Send immediate initial frame
  sendTelemetryFrame(ws);

  ws.on('message', (msg) => {
    try {
      const data = JSON.parse(msg);
      if (data.type === 'toggle_demo') {
        forceDemoMode = !!data.value;
      }
    } catch (e) {}
  });

  ws.on('close', () => {
    connectedClients = Math.max(0, connectedClients - 1);
  });
});

async function buildTelemetryPayload() {
  if (forceDemoMode || !IS_LINUX) {
    return generateSimulatedTelemetry();
  }

  const [system, network, sockets] = await Promise.all([
    collectSystemMetrics(),
    collectNetworkRates(),
    collectActiveSockets(VPS_PROFILE.ip, VPS_PROFILE.ll)
  ]);

  // If network rates is null (e.g. non-linux / missing /proc), fallback gracefully
  const netStats = network || {
    rxSec: 0,
    txSec: 0,
    rxTotal: 0,
    txTotal: 0,
    interfaces: {},
    history: []
  };

  return {
    system,
    network: netStats,
    sockets: sockets || [],
    vps: VPS_PROFILE,
    connectedClients
  };
}

async function sendTelemetryFrame(ws) {
  if (ws.readyState === WebSocket.OPEN) {
    try {
      const payload = await buildTelemetryPayload();
      ws.send(JSON.stringify(payload));
    } catch (err) {
      console.error('Error preparing frame:', err.message);
    }
  }
}

// Broadcast loop every 500ms for fluid animations
setInterval(async () => {
  if (connectedClients === 0) return;
  try {
    const payload = await buildTelemetryPayload();
    const json = JSON.stringify(payload);
    for (const client of wss.clients) {
      if (client.readyState === WebSocket.OPEN) {
        client.send(json);
      }
    }
  } catch (err) {
    console.error('Broadcast tick error:', err.message);
  }
}, 500);

server.listen(PORT, '0.0.0.0', () => {
  console.log(`=======================================================`);
  console.log(`⚡ VPS PULSE SERVER RUNNING ON PORT :${PORT}`);
  console.log(`🌐 Public URL: http://${VPS_PROFILE.ip}:${PORT}`);
  console.log(`📡 WebSocket:  ws://${VPS_PROFILE.ip}:${PORT}/ws`);
  console.log(`💻 Platform:   ${os.platform()} (${IS_LINUX ? 'Native Linux Engine' : 'Dev Simulation Mode'})`);
  console.log(`=======================================================`);
});
