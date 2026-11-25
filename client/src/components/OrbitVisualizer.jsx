import React, { useEffect, useRef, useState } from 'react';

function aggregateRadarRoutes(sockets) {
  const map = new Map();
  for (const s of sockets) {
    if (s?.geo?.isLocal) continue;
    const rawCity = s.geo?.city && s.geo.city !== 'Unknown City' ? s.geo.city : (s.geo?.org || s.geo?.country || 'Edge');
    const country = s.geo?.country || 'GL';
    const key = `${rawCity}_${country}_${s.direction}`;
    let cur = map.get(key);
    if (!cur) {
      cur = {
        ...s,
        key,
        label: rawCity,
        count: 1,
        speed: Number(s.speed) || 0
      };
      map.set(key, cur);
    } else {
      cur.count += 1;
      cur.speed += Number(s.speed) || 0;
    }
  }
  return Array.from(map.values())
    .sort((a, b) => b.speed - a.speed)
    .slice(0, 16);
}

export function OrbitVisualizer({ sockets = [], vps = null, streamerMode = false }) {
  const canvasRef = useRef(null);
  const socketsRef = useRef(sockets);
  const vpsRef = useRef(vps);
  socketsRef.current = sockets;
  vpsRef.current = vps;

  const blipsRef = useRef([]);
  const [hoveredBlip, setHoveredBlip] = useState(null);
  const [tooltipPos, setTooltipPos] = useState({ x: 0, y: 0 });

  const maskIp = (ip) => {
    if (!ip) return '';
    const clean = ip.replace(/^::ffff:/, '');
    if (!streamerMode) return clean;
    const parts = clean.split('.');
    return parts.length === 4 ? `${parts[0]}.${parts[1]}.***.***` : clean;
  };

  const fmtSpeed = (b) => {
    const val = Number(b) || 0;
    if (!val) return '0.0 Mbps';
    const mbps = (val * 8) / 1000000;
    return mbps < 0.1 ? `${((val * 8) / 1000).toFixed(0)} Kbps` : `${mbps.toFixed(1)} Mbps`;
  };

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.parentElement.getBoundingClientRect();
      if (rect.width === 0 || rect.height === 0) return;
      canvas.width = Math.round(rect.width * dpr);
      canvas.height = Math.round(rect.height * dpr);
      canvas.style.width = `${rect.width}px`;
      canvas.style.height = `${rect.height}px`;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const render = () => {
      animId = requestAnimationFrame(render);
      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const W = canvas.width / dpr;
      const H = canvas.height / dpr;
      if (W === 0 || H === 0) return;

      const cx = W / 2;
      const cy = H / 2;
      const maxR = Math.min(cx, cy) * 0.80;
      const time = Date.now() / 1000;

      ctx.clearRect(0, 0, W, H);

      // Concentric Radar Range Rings
      const rings = [
        { r: 0.30, label: 'EDGE' },
        { r: 0.52, label: 'REGIONAL' },
        { r: 0.74, label: 'TRANSIT' },
        { r: 0.96, label: 'GLOBAL' }
      ];
      rings.forEach(({ r, label }, i) => {
        ctx.strokeStyle = `rgba(0, 243, 255, ${0.07 + i * 0.02})`;
        ctx.lineWidth = 0.8;
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * r, 0, Math.PI * 2);
        ctx.stroke();

        ctx.fillStyle = 'rgba(100, 116, 139, 0.42)';
        ctx.font = '600 8px "JetBrains Mono", monospace';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'top';
        ctx.fillText(label, cx, cy - maxR * r + 4);
      });

      // Crosshairs + Degree Ticks
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.07)';
      ctx.lineWidth = 0.75;
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
      ctx.stroke();

      for (let deg = 0; deg < 360; deg += 15) {
        const rad = (deg * Math.PI) / 180;
        const inner = maxR * (deg % 45 === 0 ? 0.92 : 0.945);
        const outer = maxR * 0.975;
        ctx.strokeStyle = deg % 45 === 0 ? 'rgba(0, 243, 255, 0.25)' : 'rgba(0, 243, 255, 0.09)';
        ctx.beginPath();
        ctx.moveTo(cx + Math.cos(rad) * inner, cy + Math.sin(rad) * inner);
        ctx.lineTo(cx + Math.cos(rad) * outer, cy + Math.sin(rad) * outer);
        ctx.stroke();
      }

      // Rotating Radar Sweep Cone
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.5);
      const sweep = ctx.createConicGradient(0, 0, 0);
      sweep.addColorStop(0, 'rgba(0, 243, 255, 0.16)');
      sweep.addColorStop(0.11, 'rgba(0, 243, 255, 0.0)');
      sweep.addColorStop(1, 'rgba(0, 243, 255, 0.0)');
      ctx.fillStyle = sweep;
      ctx.beginPath();
      ctx.arc(0, 0, maxR * 0.96, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Dynamic Host Hub Glow & Expanding Ping
      const pingProgress = (time * 0.5) % 1;
      ctx.strokeStyle = `rgba(16, 185, 129, ${(1 - pingProgress) * 0.45})`;
      ctx.lineWidth = 1.5;
      ctx.beginPath();
      ctx.arc(cx, cy, 12 + pingProgress * 34, 0, Math.PI * 2);
      ctx.stroke();

      const coreGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 34);
      coreGrad.addColorStop(0, 'rgba(16, 185, 129, 0.65)');
      coreGrad.addColorStop(0.5, 'rgba(16, 185, 129, 0.12)');
      coreGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 34, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#10b981';
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 14;
      ctx.beginPath();
      ctx.arc(cx, cy, 11 + Math.sin(time * 3) * 1.5, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      const hostTag = (vpsRef.current?.country || 'VPS').slice(0, 4).toUpperCase();
      ctx.fillStyle = '#ffffff';
      ctx.font = '800 8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillText(hostTag, cx, cy);

      // Aggregated unique corridors spread cleanly around radar tiers
      const routes = aggregateRadarRoutes(socketsRef.current);
      const nextBlips = [];

      // Track drawn label bounding boxes so labels NEVER overlap!
      const occupiedBoxes = [
        // Reserve center hub area & top ring labels strip
        { x: cx - 55, y: cy - 35, w: 110, h: 70 },
        { x: cx - 35, y: cy - maxR, w: 70, h: maxR }
      ];

      routes.forEach((sock, idx) => {
        // Golden-angle / stratified spacing prevents bunching
        const angle = (idx / Math.max(1, routes.length)) * Math.PI * 2 - Math.PI / 2 + 0.18 + time * 0.02;
        const tierFrac = [0.38, 0.60, 0.82, 0.48, 0.70, 0.88][idx % 6];
        const orbitR = maxR * tierFrac;
        const nx = cx + Math.cos(angle) * orbitR;
        const ny = cy + Math.sin(angle) * orbitR;

        const isIn = sock.direction === 'inbound';
        const col = isIn ? '#00f3ff' : '#ec4899';

        // Dashed vector ray
        ctx.strokeStyle = isIn ? 'rgba(0, 243, 255, 0.16)' : 'rgba(236, 72, 153, 0.16)';
        ctx.lineWidth = 1;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        ctx.setLineDash([]);

        // Traveling photon burst in true flow direction
        const rateBoost = Math.min(2.2, 0.5 + Math.log10(Math.max(1000, sock.speed || 1000)) * 0.25);
        const pT = (time * 0.45 * rateBoost + idx * 0.19) % 1;
        const px = isIn ? nx + (cx - nx) * pT : cx + (nx - cx) * pT;
        const py = isIn ? ny + (cy - ny) * pT : cy + (ny - cy) * pT;

        ctx.fillStyle = '#ffffff';
        ctx.shadowColor = col;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(px, py, 2.4, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Blip dot
        const mbps = ((sock.speed || 0) * 8) / 1000000;
        const radius = Math.min(7.5, Math.max(4, 4 + Math.log10(mbps + 1) * 1.8));
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 9;
        ctx.beginPath();
        ctx.arc(nx, ny, radius, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Place label on outer side of blip (left if on left hemisphere, right if on right)
        const placeLeft = Math.cos(angle) < -0.15;
        const text = `${sock.geo?.country || 'GL'} · ${sock.label}${sock.count > 1 ? ` ×${sock.count}` : ''}`;
        ctx.font = '600 9.5px "JetBrains Mono", monospace';
        const metrics = ctx.measureText(text);
        const bw = metrics.width + 10;
        const bh = 16;
        const lx = placeLeft ? nx - radius - 6 : nx + radius + 6;
        const boxX = placeLeft ? lx - bw : lx;
        const boxY = ny - bh / 2;

        const collides = occupiedBoxes.some(b =>
          boxX < b.x + b.w && boxX + bw > b.x && boxY < b.y + b.h && boxY + bh > b.y
        );

        if (!collides) {
          occupiedBoxes.push({ x: boxX, y: boxY, w: bw, h: bh });
          ctx.fillStyle = 'rgba(10, 15, 30, 0.78)';
          ctx.beginPath();
          ctx.roundRect(boxX, boxY, bw, bh, 4);
          ctx.fill();
          ctx.strokeStyle = isIn ? 'rgba(0, 243, 255, 0.25)' : 'rgba(236, 72, 153, 0.25)';
          ctx.lineWidth = 0.75;
          ctx.stroke();

          ctx.fillStyle = 'rgba(226, 232, 240, 0.92)';
          ctx.textAlign = placeLeft ? 'right' : 'left';
          ctx.textBaseline = 'middle';
          ctx.fillText(text, placeLeft ? lx - 5 : lx + 5, ny + 0.5);
        }

        nextBlips.push({ x: nx, y: ny, r: radius + 7, sock });
      });

      blipsRef.current = nextBlips;
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []);

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const rect = canvas.getBoundingClientRect();
    const mx = e.clientX - rect.left;
    const my = e.clientY - rect.top;

    const hit = blipsRef.current.find(b => Math.hypot(b.x - mx, b.y - my) <= b.r);
    setHoveredBlip(hit ? hit.sock : null);
    if (hit) {
      setTooltipPos({
        x: Math.min(rect.width - 250, Math.max(12, mx + 14)),
        y: Math.min(rect.height - 130, Math.max(12, my + 14))
      });
    }
  };

  const corridorCount = aggregateRadarRoutes(sockets).length;

  return (
    <div className="relative w-full h-full min-h-[500px] rounded-2xl cyber-panel overflow-hidden">
      <div
        className="absolute inset-0 pointer-events-none"
        style={{ background: 'radial-gradient(circle at 50% 50%, rgba(4, 18, 38, 0.65) 0%, rgba(2, 6, 16, 0.95) 80%)' }}
      />
      <canvas
        ref={canvasRef}
        onMouseMove={handleMouseMove}
        onMouseLeave={() => setHoveredBlip(null)}
        className="relative z-10 w-full h-full cursor-crosshair"
      />

      <div className="absolute top-3.5 left-3.5 z-20 pointer-events-none bg-slate-950/75 backdrop-blur-md px-3.5 py-2 rounded-xl border border-cyan-500/20">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2 w-2">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2 w-2 bg-cyan-400" />
          </span>
          <span className="text-[10px] font-display uppercase tracking-[0.2em] text-cyan-400 font-bold">
            Orbital Radar // Topology
          </span>
        </div>
        <div className="text-[10px] font-mono-val text-slate-400 mt-0.5">
          HUB: <span className="text-emerald-400 font-bold">{(vps?.city || 'HOST').toUpperCase()}</span> • CORRIDORS: <span className="text-cyan-300 font-bold">{corridorCount}</span>
        </div>
      </div>

      {hoveredBlip && (
        <div
          className="absolute z-50 pointer-events-none bg-slate-950/95 border border-cyan-400/60 shadow-glow-cyan p-2.5 rounded-xl text-[11px] font-mono-val backdrop-blur-md w-60"
          style={{ top: `${tooltipPos.y}px`, left: `${tooltipPos.x}px` }}
        >
          <div className="flex items-center justify-between pb-1 border-b border-slate-800">
            <span className="font-bold text-cyan-300 truncate">{hoveredBlip.geo?.flag} {hoveredBlip.label}, {hoveredBlip.geo?.country}</span>
            <span className={`px-1.5 py-0.5 rounded text-[9px] font-bold ${
              hoveredBlip.direction === 'inbound' ? 'bg-cyan-500/20 text-cyan-300' : 'bg-pink-500/20 text-pink-300'
            }`}>
              {hoveredBlip.direction === 'inbound' ? '▼ DL' : '▲ UL'}
            </span>
          </div>
          <div className="mt-1.5 space-y-0.5 text-[10px] text-slate-300">
            <div className="flex justify-between"><span className="text-slate-500">IP:</span><span>{maskIp(hoveredBlip.remoteIp)}</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Streams:</span><span className="text-purple-300">×{hoveredBlip.count} ({hoveredBlip.process})</span></div>
            <div className="flex justify-between"><span className="text-slate-500">Rate:</span><span className="text-emerald-400 font-bold">{fmtSpeed(hoveredBlip.speed)}</span></div>
          </div>
        </div>
      )}
    </div>
  );
}
