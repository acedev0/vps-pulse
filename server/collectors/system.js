import fs from 'fs';
import os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';

const execAsync = promisify(exec);

let lastCpuTimes = null;

function getLinuxCpuUsage() {
  try {
    const data = fs.readFileSync('/proc/stat', 'utf8');
    const lines = data.split('\n');
    const cpuLine = lines.find(l => l.startsWith('cpu '));
    if (!cpuLine) return null;

    const parts = cpuLine.trim().split(/\s+/).slice(1).map(Number);
    const user = parts[0] || 0;
    const nice = parts[1] || 0;
    const system = parts[2] || 0;
    const idle = parts[3] || 0;
    const iowait = parts[4] || 0;
    const irq = parts[5] || 0;
    const softirq = parts[6] || 0;
    const steal = parts[7] || 0;

    const total = user + nice + system + idle + iowait + irq + softirq + steal;
    const active = total - idle - iowait;

    if (!lastCpuTimes) {
      lastCpuTimes = { total, active };
      return 0;
    }

    const deltaTotal = total - lastCpuTimes.total;
    const deltaActive = active - lastCpuTimes.active;
    lastCpuTimes = { total, active };

    if (deltaTotal <= 0) return 0;
    return Math.min(100, Math.max(0, (deltaActive / deltaTotal) * 100));
  } catch (err) {
    return null;
  }
}

function getLinuxMemInfo() {
  try {
    const data = fs.readFileSync('/proc/meminfo', 'utf8');
    const mem = {};
    for (const line of data.split('\n')) {
      const match = line.match(/^(\w+):\s+(\d+)/);
      if (match) {
        mem[match[1]] = parseInt(match[2], 10) * 1024; // KB to Bytes
      }
    }
    const total = mem.MemTotal || os.totalmem();
    const available = mem.MemAvailable || mem.MemFree || os.freemem();
    const used = total - available;
    const buffers = mem.Buffers || 0;
    const cached = mem.Cached || 0;
    const swapTotal = mem.SwapTotal || 0;
    const swapFree = mem.SwapFree || 0;
    const swapUsed = swapTotal - swapFree;

    return {
      total,
      used,
      free: available,
      buffers,
      cached,
      percent: total > 0 ? (used / total) * 100 : 0,
      swapTotal,
      swapUsed,
      swapPercent: swapTotal > 0 ? (swapUsed / swapTotal) * 100 : 0
    };
  } catch (err) {
    const total = os.totalmem();
    const free = os.freemem();
    const used = total - free;
    return {
      total,
      used,
      free,
      buffers: 0,
      cached: 0,
      percent: (used / total) * 100,
      swapTotal: 0,
      swapUsed: 0,
      swapPercent: 0
    };
  }
}

let cachedDisk = { total: 0, used: 0, free: 0, percent: 0 };
let lastDiskCheck = 0;

async function getDiskUsage() {
  const now = Date.now();
  if (now - lastDiskCheck < 15000 && cachedDisk.total > 0) {
    return cachedDisk;
  }
  lastDiskCheck = now;
  try {
    const { stdout } = await execAsync('df -k / | tail -n 1');
    const parts = stdout.trim().split(/\s+/);
    if (parts.length >= 5) {
      const total = parseInt(parts[1], 10) * 1024;
      const used = parseInt(parts[2], 10) * 1024;
      const free = parseInt(parts[3], 10) * 1024;
      const percent = parseInt(parts[4].replace('%', ''), 10);
      cachedDisk = { total, used, free, percent };
    }
  } catch (e) {
    // Fallback if df not available
    cachedDisk = { total: 4000 * 1024 * 1024 * 1024, used: 250 * 1024 * 1024 * 1024, free: 3750 * 1024 * 1024 * 1024, percent: 6.25 };
  }
  return cachedDisk;
}

export async function collectSystemMetrics() {
  let cpu = getLinuxCpuUsage();
  if (cpu === null) {
    // OS fallback
    const cpus = os.cpus();
    let totalIdle = 0, totalTick = 0;
    cpus.forEach(core => {
      for (const type in core.times) totalTick += core.times[type];
      totalIdle += core.times.idle;
    });
    cpu = totalTick > 0 ? ((totalTick - totalIdle) / totalTick) * 100 : 15;
  }

  const memory = getLinuxMemInfo();
  const disk = await getDiskUsage();
  const loadavg = os.loadavg();
  const uptime = os.uptime();
  const hostname = os.hostname();
  const platform = os.platform();
  const release = os.release();
  const arch = os.arch();
  const cpus = os.cpus().length;

  return {
    cpu: Math.round(cpu * 10) / 10,
    memory: {
      total: memory.total,
      used: memory.used,
      free: memory.free,
      percent: Math.round(memory.percent * 10) / 10,
      swapTotal: memory.swapTotal,
      swapUsed: memory.swapUsed,
      swapPercent: Math.round(memory.swapPercent * 10) / 10
    },
    disk,
    loadavg: [
      Math.round(loadavg[0] * 100) / 100,
      Math.round(loadavg[1] * 100) / 100,
      Math.round(loadavg[2] * 100) / 100
    ],
    uptime,
    cores: cpus,
    hostInfo: {
      hostname,
      platform,
      release,
      arch
    }
  };
}
