import express from 'express';
import http from 'http';
import { WebSocketServer, WebSocket } from 'ws';
import path from 'path';
import { fileURLToPath } from 'url';
import os from 'os';
import fs from 'fs';
import cors from 'cors';

import { collectSystemMetrics } from './collectors/system.js';
import { collectNetworkRates } from './collectors/network.js';
import { collectActiveSockets } from './collectors/sockets.js';
import { lookupIp } from './collectors/geoip.js';
import { generateSimulatedTelemetry } from './simulator.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// 1. Load environment from /etc/vps-pulse/vps-pulse.env or local .env
function loadEnvFile(filePath) {
  try {
    if (fs.existsSync(filePath)) {
      const content = fs.readFileSync(filePath, 'utf-8');
      for (const line of content.split('\n')) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx !== -1) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^["']|["']$/g, '');
          if (!process.env[key]) {
            process.env[key] = val;
          }
        }
      }
    }
  } catch (e) {}
}

loadEnvFile('/etc/vps-pulse/vps-pulse.env');
loadEnvFile(path.join(__dirname, '../.env'));

const PORT = parseInt(process.env.PORT || '7777', 10);
const IS_LINUX = os.platform() === 'linux';
let forceDemoMode = process.env.DEMO_MODE === 'true';

const app = express();
app.use(cors());
app.use(express.json());

// Serve static build of frontend
const clientDist = path.join(__dirname, '../client/dist');
app.use(express.static(clientDist));

// 2. Dynamic VPS Node profile (auto-detects anywhere in the world)
let VPS_PROFILE = {
  ip: process.env.HOST_IP || process.env.VPS_IP || '127.0.0.1',
  hostname: process.env.NODE_NAME || process.env.SERVER_NAME || os.hostname(),
  city: 'Detecting Location...',
  region: '',
  country: 'GLOBAL',
  flag: '🌐',
  ll: [1.3521, 103.8198],
  org: 'Host Network',
  storageTier: 'Host Storage',
  port: PORT,
  platform: os.platform()
};

async function resolveHostIp() {
  if (process.env.HOST_IP || process.env.VPS_IP) {
    return (process.env.HOST_IP || process.env.VPS_IP).trim();
  }
  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 2500);
    const resp = await fetch('https://api.ipify.org?format=text', { signal: controller.signal });
    clearTimeout(timeout);
    if (resp.ok) {
      const ip = (await resp.text()).trim();
      if (/^[0-9]+\.[0-9]+\.[0-9]+\.[0-9]+$/.test(ip)) return ip;
    }
  } catch (e) {}

  const ifaces = os.networkInterfaces();
  for (const name of Object.keys(ifaces)) {
    for (const net of ifaces[name] || []) {
      if (net.family === 'IPv4' && !net.internal && !net.address.startsWith('127.')) {
        return net.address;
      }
    }
  }
  return '127.0.0.1';
}

async function updateHostProfile() {
  try {
    const ip = await resolveHostIp();
    const geo = lookupIp(ip) || {};
    VPS_PROFILE.ip = ip;
    VPS_PROFILE.hostname = process.env.NODE_NAME || process.env.SERVER_NAME || os.hostname();
    VPS_PROFILE.city = process.env.HOST_CITY || geo.city || 'Cloud Node';
    VPS_PROFILE.country = process.env.HOST_COUNTRY || geo.country || 'GLOBAL';
    VPS_PROFILE.flag = geo.flag || '🌐';
    VPS_PROFILE.ll = geo.ll || [1.3521, 103.8198];
    VPS_PROFILE.org = process.env.HOST_ORG || geo.org || 'Primary Transit Network';
    VPS_PROFILE.port = PORT;
  } catch (err) {
    console.error('Host profile initialization note:', err.message);
  }
}
updateHostProfile();

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
