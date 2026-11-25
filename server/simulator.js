// Realistic mock data generator for development and testing

const MOCK_DESTINATIONS = [
  { city: 'Tokyo', country: 'JP', flag: '🇯🇵', ll: [35.6762, 139.6503], org: 'AWS ap-northeast-1', ip: '13.112.45.102' },
  { city: 'Frankfurt', country: 'DE', flag: '🇩🇪', ll: [50.1109, 8.6821], org: 'Hetzner Cloud DE', ip: '159.69.112.44' },
  { city: 'San Jose', country: 'US', flag: '🇺🇸', ll: [37.3382, -121.8863], org: 'Cloudflare Edge CDN', ip: '104.16.249.5' },
  { city: 'London', country: 'GB', flag: '🇬🇧', ll: [51.5074, -0.1278], org: 'DigitalOcean Lon1', ip: '178.62.204.11' },
  { city: 'Sydney', country: 'AU', flag: '🇦🇺', ll: [-33.8688, 151.2093], org: 'Google Cloud Syd', ip: '34.87.198.53' },
  { city: 'Sao Paulo', country: 'BR', flag: '🇧🇷', ll: [-23.5505, -46.6333], org: 'Oracle Cloud BR', ip: '129.148.42.19' },
  { city: 'Amsterdam', country: 'NL', flag: '🇳🇱', ll: [52.3676, 4.9041], org: 'Telegram DC2 Core', ip: '149.154.167.220' },
  { city: 'Singapore', country: 'SG', flag: '🇸🇬', ll: [1.3521, 103.8198], org: 'Tencent Cloud SG', ip: '43.163.115.17' },
  { city: 'New York', country: 'US', flag: '🇺🇸', ll: [40.7128, -74.0060], org: 'Fastly Edge NY', ip: '151.101.129.140' },
  { city: 'Mumbai', country: 'IN', flag: '🇮🇳', ll: [19.0760, 72.8777], org: 'Akamai Edge BOM', ip: '23.45.118.89' }
];

const MOCK_PROCESSES = ['xray-core', 'nginx: worker', 'pm2:tiktok-brain', 'sshd: root@pts/0', 'uvicorn', 'curl: sync'];

let mockCumulativeRx = 1024 * 1024 * 1024 * 42.5; // 42.5 GB
let mockCumulativeTx = 1024 * 1024 * 1024 * 138.2; // 138.2 GB
let mockTime = Date.now();
const mockHistory = [];

export function generateSimulatedTelemetry(vpsProfile = null) {
  const now = Date.now();
  const dt = (now - mockTime) / 1000;
  mockTime = now;

  // Generate fluctuating download (0.8 MB/s to 12.5 MB/s) and upload (1.5 MB/s to 28.0 MB/s)
  const baseRx = 2.5 * 1024 * 1024;
  const baseTx = 6.8 * 1024 * 1024;
  const rxNoise = (Math.sin(now / 5000) * 0.4 + (Math.random() - 0.5) * 0.3) * baseRx;
  const txNoise = (Math.cos(now / 4000) * 0.5 + (Math.random() - 0.5) * 0.4) * baseTx;

  const rxSec = Math.max(150000, Math.round(baseRx + rxNoise));
  const txSec = Math.max(350000, Math.round(baseTx + txNoise));

  mockCumulativeRx += rxSec * dt;
  mockCumulativeTx += txSec * dt;

  mockHistory.push({
    time: Math.floor(now / 1000),
    rx: rxSec,
    tx: txSec
  });
  if (mockHistory.length > 60) mockHistory.shift();

  // Generate 8-12 active sockets
  const activeSockets = MOCK_DESTINATIONS.map((dest, idx) => {
    const isUpload = idx % 2 === 0;
    const speed = Math.round((isUpload ? txSec : rxSec) * (0.08 + (idx * 0.02) + Math.random() * 0.05));
    return {
      id: `mock-sock-${idx}`,
      protocol: idx % 3 === 0 ? 'UDP' : 'TCP',
      localPort: 443,
      remoteIp: dest.ip,
      remotePort: 40000 + idx * 123,
      process: MOCK_PROCESSES[idx % MOCK_PROCESSES.length],
      pid: 1000 + idx * 85,
      direction: isUpload ? 'outbound' : 'inbound',
      speed,
      recvQ: isUpload ? 0 : Math.round(speed * 0.05),
      sendQ: isUpload ? Math.round(speed * 0.05) : 0,
      geo: {
        city: dest.city,
        country: dest.country,
        flag: dest.flag,
        ll: dest.ll,
        org: dest.org,
        isLocal: false
      }
    };
  });

  return {
    system: {
      cpu: Math.round((35 + Math.sin(now / 3000) * 12 + Math.random() * 5) * 10) / 10,
      memory: {
        total: 8 * 1024 * 1024 * 1024,
        used: Math.round((3.2 + Math.sin(now / 8000) * 0.2) * 1024 * 1024 * 1024),
        free: 4.8 * 1024 * 1024 * 1024,
        percent: 41.5,
        swapTotal: 2 * 1024 * 1024 * 1024,
        swapUsed: 120 * 1024 * 1024,
        swapPercent: 5.8
      },
      disk: {
        total: 4000 * 1024 * 1024 * 1024, // 4TB
        used: 312 * 1024 * 1024 * 1024,
        free: 3688 * 1024 * 1024 * 1024,
        percent: 7.8
      },
      loadavg: [
        Math.round((0.85 + Math.random() * 0.1) * 100) / 100,
        0.72,
        0.65
      ],
      uptime: 3600 * 24 * 11 + 4520,
      cores: 4,
      hostInfo: {
        hostname: 'linode-4tb-sg',
        platform: 'linux',
        release: '6.8.0-147-generic',
        arch: 'x86_64'
      }
    },
    network: {
      rxSec,
      txSec,
      rxTotal: Math.round(mockCumulativeRx),
      txTotal: Math.round(mockCumulativeTx),
      interfaces: {
        eth0: { rx: Math.round(mockCumulativeRx), tx: Math.round(mockCumulativeTx) }
      },
      history: mockHistory
    },
    sockets: activeSockets,
    vps: vpsProfile || {
      ip: '127.0.0.1',
      hostname: 'demo-vps',
      city: 'Cloud Node',
      country: 'DEMO',
      flag: '🌐',
      ll: [1.3521, 103.8198],
      org: 'Simulation Mode'
    }
  };
}
