import fs from 'fs';

let lastNetworkSnapshot = null;
const historyBuffer = [];
const MAX_HISTORY = 60;

function readProcNetDev() {
  try {
    const content = fs.readFileSync('/proc/net/dev', 'utf8');
    const lines = content.split('\n');
    let totalRx = 0;
    let totalTx = 0;
    const interfaces = {};

    for (let i = 2; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line) continue;
      const parts = line.split(':');
      if (parts.length < 2) continue;
      const iface = parts[0].trim();
      // Skip loopback interface
      if (iface === 'lo') continue;

      const stats = parts[1].trim().split(/\s+/).map(Number);
      const rx = stats[0] || 0;
      const tx = stats[8] || 0;

      totalRx += rx;
      totalTx += tx;
      interfaces[iface] = { rx, tx };
    }

    return { totalRx, totalTx, interfaces, timestamp: Date.now() };
  } catch (e) {
    return null;
  }
}

export function collectNetworkRates() {
  const current = readProcNetDev();

  if (!current) {
    // Local simulation fallback
    return null;
  }

  if (!lastNetworkSnapshot) {
    lastNetworkSnapshot = current;
    return {
      rxSec: 0,
      txSec: 0,
      rxTotal: current.totalRx,
      txTotal: current.totalTx,
      interfaces: current.interfaces,
      history: historyBuffer
    };
  }

  const dt = Math.max(0.1, (current.timestamp - lastNetworkSnapshot.timestamp) / 1000);
  const rxDelta = Math.max(0, current.totalRx - lastNetworkSnapshot.totalRx);
  const txDelta = Math.max(0, current.totalTx - lastNetworkSnapshot.totalTx);

  const rxSec = Math.round(rxDelta / dt);
  const txSec = Math.round(txDelta / dt);

  lastNetworkSnapshot = current;

  // Add to rolling history
  const point = {
    time: Math.floor(current.timestamp / 1000),
    rx: rxSec,
    tx: txSec
  };
  historyBuffer.push(point);
  if (historyBuffer.length > MAX_HISTORY) {
    historyBuffer.shift();
  }

  return {
    rxSec,
    txSec,
    rxTotal: current.totalRx,
    txTotal: current.totalTx,
    interfaces: current.interfaces,
    history: historyBuffer
  };
}
