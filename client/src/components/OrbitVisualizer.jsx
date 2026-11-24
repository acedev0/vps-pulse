import React, { useEffect, useRef } from 'react';

export function OrbitVisualizer({ sockets = [], vps = null, streamerMode = false }) {
  const canvasRef = useRef(null);
  const socketsRef = useRef(sockets);
  socketsRef.current = sockets;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio, 2);
      const rect = canvas.parentElement.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      if (W === 0 || H === 0) return;
      canvas.width = W * dpr;
      canvas.height = H * dpr;
      canvas.style.width = W + 'px';
      canvas.style.height = H + 'px';
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    };
    resize();
    window.addEventListener('resize', resize);

    const render = () => {
      animId = requestAnimationFrame(render);
      const W = canvas.width / Math.min(window.devicePixelRatio, 2);
      const H = canvas.height / Math.min(window.devicePixelRatio, 2);
      const cx = W / 2;
      const cy = H / 2;
      const maxR = Math.min(cx, cy) * 0.82;
      const time = Date.now() / 1000;

      ctx.clearRect(0, 0, W, H);

      // Orbital rings
      [0.28, 0.5, 0.72, 0.95].forEach((r, i) => {
        ctx.strokeStyle = `rgba(0, 243, 255, ${0.04 + i * 0.015})`;
        ctx.lineWidth = 0.5;
        ctx.beginPath();
        ctx.arc(cx, cy, maxR * r, 0, Math.PI * 2);
        ctx.stroke();
      });

      // Crosshairs
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.05)';
      ctx.lineWidth = 0.5;
      ctx.beginPath();
      ctx.moveTo(cx - maxR, cy); ctx.lineTo(cx + maxR, cy);
      ctx.moveTo(cx, cy - maxR); ctx.lineTo(cx, cy + maxR);
      ctx.stroke();

      // Radar sweep
      ctx.save();
      ctx.translate(cx, cy);
      ctx.rotate(time * 0.45);
      const sweep = ctx.createConicGradient(0, 0, 0);
      sweep.addColorStop(0, 'rgba(0, 243, 255, 0.12)');
      sweep.addColorStop(0.08, 'rgba(0, 243, 255, 0.0)');
      sweep.addColorStop(1, 'rgba(0, 243, 255, 0.0)');
      ctx.fillStyle = sweep;
      ctx.beginPath();
      ctx.arc(0, 0, maxR, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();

      // Central node glow
      const coreGrad = ctx.createRadialGradient(cx, cy, 2, cx, cy, 32);
      coreGrad.addColorStop(0, 'rgba(16, 185, 129, 0.6)');
      coreGrad.addColorStop(0.5, 'rgba(16, 185, 129, 0.08)');
      coreGrad.addColorStop(1, 'transparent');
      ctx.fillStyle = coreGrad;
      ctx.beginPath();
      ctx.arc(cx, cy, 32, 0, Math.PI * 2);
      ctx.fill();

      ctx.fillStyle = '#10b981';
      ctx.shadowColor = '#10b981';
      ctx.shadowBlur = 12;
      ctx.beginPath();
      ctx.arc(cx, cy, 9 + Math.sin(time * 3) * 2, 0, Math.PI * 2);
      ctx.fill();
      ctx.shadowBlur = 0;

      ctx.fillStyle = '#fff';
      ctx.font = '8px "JetBrains Mono", monospace';
      ctx.textAlign = 'center';
      ctx.fillText('VPS-SG', cx, cy + 3);

      // Socket nodes from ref (ZERO teardown)
      const display = socketsRef.current.slice(0, 24);
      display.forEach((sock, idx) => {
        const angleBase = (idx / Math.max(1, display.length)) * Math.PI * 2;
        const drift = time * 0.03 * (idx % 2 === 0 ? 1 : -1);
        const angle = angleBase + drift;
        const orbitR = maxR * (0.35 + (idx % 3) * 0.22);
        const nx = cx + Math.cos(angle) * orbitR;
        const ny = cy + Math.sin(angle) * orbitR;

        const isIn = sock.direction === 'inbound';
        const col = isIn ? '#00f3ff' : '#f59e0b';

        // Connection line
        ctx.strokeStyle = isIn ? 'rgba(0,243,255,0.08)' : 'rgba(245,158,11,0.08)';
        ctx.lineWidth = 0.8;
        ctx.setLineDash([3, 5]);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(nx, ny);
        ctx.stroke();
        ctx.setLineDash([]);

        // Animated photon pulse
        const pT = (time * (0.6 + idx * 0.04)) % 1;
        const px = isIn ? nx + (cx - nx) * pT : cx + (nx - cx) * pT;
        const py = isIn ? ny + (cy - ny) * pT : cy + (ny - cy) * pT;

        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 10;
        ctx.beginPath();
        ctx.arc(px, py, 2.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Node dot
        ctx.fillStyle = col;
        ctx.shadowColor = col;
        ctx.shadowBlur = 6;
        ctx.beginPath();
        ctx.arc(nx, ny, 4.5, 0, Math.PI * 2);
        ctx.fill();
        ctx.shadowBlur = 0;

        // Label
        ctx.fillStyle = 'rgba(203,213,225,0.7)';
        ctx.font = '8px "JetBrains Mono", monospace';
        ctx.textAlign = 'left';
        ctx.fillText(`${sock.geo?.flag || ''} ${sock.geo?.city || sock.remoteIp?.slice(0, 12) || ''}`, nx + 8, ny + 3);
      });
    };

    render();

    return () => {
      cancelAnimationFrame(animId);
      window.removeEventListener('resize', resize);
    };
  }, []); // Run ONCE on mount!

  return (
    <div className="relative w-full h-full min-h-[480px] rounded-2xl cyber-panel overflow-hidden">
      <canvas ref={canvasRef} className="w-full h-full cursor-crosshair" />

      <div className="absolute top-4 left-4 z-20 pointer-events-none">
        <div className="flex items-center gap-2">
          <span className="relative flex h-2.5 w-2.5">
            <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-cyan-400 opacity-75" />
            <span className="relative inline-flex rounded-full h-2.5 w-2.5 bg-cyan-400" />
          </span>
          <span className="text-[11px] font-display uppercase tracking-[0.2em] text-cyan-400 font-bold">
            Orbital Radar // Topology
          </span>
        </div>
      </div>
    </div>
  );
}
