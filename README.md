# VPS Pulse

> Real-time Linux server telemetry dashboard and 3D network traffic visualizer.

VPS Pulse monitors Linux server performance and active network traffic. It reads kernel statistics via `/proc` and socket data via `ss`, resolves geolocation and autonomous system networks, and streams metrics over WebSockets to an interactive 3D WebGL dashboard.

---

## Previews

### Dashboard Overview
![Dashboard Overview](./screenshots/vps-pulse-dashboard.png)

### 3D Planetary Traffic Visualizer
![3D Globe Visualizer](./screenshots/vps-pulse-earth-globe.png)

---

## Features

- **3D Planetary Visualizer**: Three.js WebGL globe with high-resolution satellite imagery, independent atmospheric cloud layer, and great-circle spherical linear interpolation (SLERP) geodesic arcs connecting network endpoints.
- **Speedometer Gauges (Mbps)**: Dual non-linear gauges for real-time inbound and outbound bandwidth monitoring.
- **60-Second Oscilloscope**: Real-time canvas waveform visualizer plotting live download and upload throughput.
- **System Vitals HUD**: Core CPU utilization, RAM usage, storage capacity, and system load averages.
- **Connection Matrix**: Tabular inspector displaying active TCP/UDP sockets, remote endpoints, process IDs, and geolocation data.

---

## Quick Start

### Installation

```bash
git clone https://github.com/acedev0/vps-pulse.git
cd vps-pulse
npm install
npm run build
npm start
```

Open `http://localhost:7777` in your browser.

---

## Production Deployment

### PM2 Process Manager

```bash
npm install -g pm2
pm2 start ecosystem.config.cjs
pm2 save
```

---

## License

MIT License. Copyright (c) 2026 Ace.
