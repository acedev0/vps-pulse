import React, { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';

const SCALE_STEPS = [2, 5, 10, 25, 50, 100, 250, 500, 1000, 2500];

function pickScaleCeiling(peakMbps) {
  const padded = peakMbps * 1.18;
  for (const step of SCALE_STEPS) {
    if (padded <= step) return step;
  }
  return Math.ceil(padded / 500) * 500;
}

export function BandwidthChart({ history = [] }) {
  const canvasRef = useRef(null);
  const historyRef = useRef(history);
  historyRef.current = history;

  const hoverRef = useRef({ active: false, x: 0, idx: -1 });
  const [hoverInfo, setHoverInfo] = useState(null);

  const smoothPointsRef = useRef([]);
  const currentMaxRef = useRef(10);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const render = () => {
      animId = requestAnimationFrame(render);

      const dpr = Math.min(window.devicePixelRatio || 1, 2);
      const rect = canvas.parentElement.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      if (W === 0 || H === 0) return;

      if (canvas.width !== Math.round(W * dpr) || canvas.height !== Math.round(H * dpr)) {
        canvas.width = Math.round(W * dpr);
        canvas.height = Math.round(H * dpr);
        canvas.style.width = `${W}px`;
        canvas.style.height = `${H}px`;
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const raw = historyRef.current;
      const targetPoints = raw.map(p => ({
        rxMbps: ((p.rx || 0) * 8) / 1000000,
        txMbps: ((p.tx || 0) * 8) / 1000000
      }));

      if (smoothPointsRef.current.length !== targetPoints.length) {
        smoothPointsRef.current = targetPoints.map(p => ({ ...p }));
      } else {
        for (let i = 0; i < targetPoints.length; i++) {
          smoothPointsRef.current[i].rxMbps += (targetPoints[i].rxMbps - smoothPointsRef.current[i].rxMbps) * 0.16;
          smoothPointsRef.current[i].txMbps += (targetPoints[i].txMbps - smoothPointsRef.current[i].txMbps) * 0.16;
        }
      }

      const pts = smoothPointsRef.current.length > 1
        ? smoothPointsRef.current
        : [{ rxMbps: 0, txMbps: 0 }, { rxMbps: 0, txMbps: 0 }];

      const observedPeak = Math.max(0.5, ...pts.map(p => Math.max(p.rxMbps, p.txMbps)));
      const targetCeiling = pickScaleCeiling(observedPeak);
      currentMaxRef.current += (targetCeiling - currentMaxRef.current) * 0.1;
      const maxMbps = currentMaxRef.current;

      const pad = { top: 12, bottom: 8, left: 36, right: 10 };
      const plotW = Math.max(10, W - pad.left - pad.right);
      const plotH = Math.max(10, H - pad.top - pad.bottom);

      // Subtle Y-axis reference lines & monospace labels
      ctx.font = '600 9px "JetBrains Mono", monospace';
      ctx.textAlign = 'right';
      ctx.textBaseline = 'middle';
      const levels = [0, 0.5, 1.0];
      levels.forEach((lvl) => {
        const y = pad.top + plotH * (1 - lvl);
        ctx.strokeStyle = lvl === 0 ? 'rgba(148, 163, 184, 0.16)' : 'rgba(0, 243, 255, 0.08)';
        ctx.lineWidth = 0.75;
        ctx.beginPath();
        if (lvl > 0) ctx.setLineDash([3, 4]);
        ctx.moveTo(pad.left, y);
        ctx.lineTo(W - pad.right, y);
        ctx.stroke();
        ctx.setLineDash([]);

        const val = maxMbps * lvl;
        const lbl = val === 0 ? '0' : val >= 100 ? `${Math.round(val)}` : `${val < 20 && val % 1 !== 0 ? val.toFixed(1) : Math.round(val)}`;
        ctx.fillStyle = 'rgba(148, 163, 184, 0.55)';
        ctx.fillText(lbl, pad.left - 6, y);
      });

      // Vertical time grid markers
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.04)';
      ctx.lineWidth = 0.75;
      for (let t = 1; t < 4; t++) {
        const vx = pad.left + (plotW * t) / 4;
        ctx.beginPath();
        ctx.moveTo(vx, pad.top);
        ctx.lineTo(vx, pad.top + plotH);
        ctx.stroke();
      }

      const getX = (i) => pad.left + (i / Math.max(1, pts.length - 1)) * plotW;
      const getY = (v) => pad.top + plotH - Math.min(1, v / maxMbps) * plotH;

      const traceCurve = () => {
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const x = getX(i);
          const y = getY(pts[i]._val);
          if (i === 0) ctx.moveTo(x, y);
          else {
            const prevX = getX(i - 1);
            const prevY = getY(pts[i - 1]._val);
            const cpx = (prevX + x) / 2;
            ctx.bezierCurveTo(cpx, prevY, cpx, y, x, y);
          }
        }
      };

      const drawWave = (key, lineColor, areaRgba) => {
        for (let i = 0; i < pts.length; i++) pts[i]._val = pts[i][key];

        // 1. Vertical gradient area fill
        const areaGrad = ctx.createLinearGradient(0, pad.top, 0, pad.top + plotH);
        areaGrad.addColorStop(0, areaRgba.replace('ALPHA', '0.32'));
        areaGrad.addColorStop(0.55, areaRgba.replace('ALPHA', '0.07'));
        areaGrad.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.moveTo(getX(0), pad.top + plotH);
        for (let i = 0; i < pts.length; i++) {
          const x = getX(i);
          const y = getY(pts[i]._val);
          if (i === 0) ctx.lineTo(x, y);
          else {
            const prevX = getX(i - 1);
            const prevY = getY(pts[i - 1]._val);
            const cpx = (prevX + x) / 2;
            ctx.bezierCurveTo(cpx, prevY, cpx, y, x, y);
          }
        }
        ctx.lineTo(getX(pts.length - 1), pad.top + plotH);
        ctx.closePath();
        ctx.fillStyle = areaGrad;
        ctx.fill();

        // 2. Wide soft phosphor glow stroke
        ctx.strokeStyle = areaRgba.replace('ALPHA', '0.28');
        ctx.lineWidth = 4.5;
        ctx.lineJoin = 'round';
        traceCurve();
        ctx.stroke();

        // 3. Sharp bright core line
        ctx.shadowColor = lineColor;
        ctx.shadowBlur = 8;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 1.9;
        traceCurve();
        ctx.stroke();
        ctx.shadowBlur = 0;

        // 4. Live leading tracer dot + pulsing sonar halo
        if (pts.length > 0) {
          const lastX = getX(pts.length - 1);
          const lastY = getY(pts[pts.length - 1]._val);
          const pulse = (Date.now() % 1400) / 1400;

          ctx.strokeStyle = areaRgba.replace('ALPHA', String((1 - pulse) * 0.65));
          ctx.lineWidth = 1.5;
          ctx.beginPath();
          ctx.arc(lastX, lastY, 3 + pulse * 7, 0, Math.PI * 2);
          ctx.stroke();

          ctx.fillStyle = '#ffffff';
          ctx.shadowColor = lineColor;
          ctx.shadowBlur = 10;
          ctx.beginPath();
          ctx.arc(lastX, lastY, 2.8, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      };

      drawWave('txMbps', '#ec4899', 'rgba(236, 72, 153, ALPHA)');
      drawWave('rxMbps', '#00f3ff', 'rgba(0, 243, 255, ALPHA)');

      // Interactive Hover Scanner Crosshair
      if (hoverRef.current.active && pts.length > 1) {
        const clampedX = Math.max(pad.left, Math.min(W - pad.right, hoverRef.current.x));
        const ratio = (clampedX - pad.left) / plotW;
        const idx = Math.max(0, Math.min(pts.length - 1, Math.round(ratio * (pts.length - 1))));
        const sx = getX(idx);

        ctx.strokeStyle = 'rgba(255, 255, 255, 0.25)';
        ctx.lineWidth = 1;
        ctx.setLineDash([2, 2]);
        ctx.beginPath();
        ctx.moveTo(sx, pad.top);
        ctx.lineTo(sx, pad.top + plotH);
        ctx.stroke();
        ctx.setLineDash([]);

        [
          { y: getY(pts[idx].rxMbps), col: '#00f3ff' },
          { y: getY(pts[idx].txMbps), col: '#ec4899' }
        ].forEach(({ y, col }) => {
          ctx.fillStyle = col;
          ctx.beginPath();
          ctx.arc(sx, y, 4, 0, Math.PI * 2);
          ctx.fill();
          ctx.strokeStyle = '#03060e';
          ctx.lineWidth = 1.5;
          ctx.stroke();
        });
      }
    };

    render();
    return () => cancelAnimationFrame(animId);
  }, []);

  const handleMouseMove = (e) => {
    const canvas = canvasRef.current;
    if (!canvas || history.length < 2) return;
    const rect = canvas.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const padLeft = 36;
    const padRight = 10;
    const plotW = Math.max(10, rect.width - padLeft - padRight);
    const ratio = Math.max(0, Math.min(1, (x - padLeft) / plotW));
    const idx = Math.round(ratio * (history.length - 1));
    const pt = history[idx];

    hoverRef.current = { active: true, x, idx };
    if (pt) {
      setHoverInfo({
        x: Math.min(rect.width - 145, Math.max(40, x + 10)),
        rxMbps: (((pt.rx || 0) * 8) / 1000000).toFixed(1),
        txMbps: (((pt.tx || 0) * 8) / 1000000).toFixed(1),
        ago: Math.round(((history.length - 1 - idx) * 0.5))
      });
    }
  };

  const handleMouseLeave = () => {
    hoverRef.current.active = false;
    setHoverInfo(null);
  };

  const peakMbps = history.length > 0
    ? (Math.max(...history.map(p => Math.max(p.rx || 0, p.tx || 0))) * 8) / 1000000
    : 0;

  return (
    <div className="cyber-panel p-4 rounded-2xl flex flex-col gap-2 flex-1 min-h-[180px]">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-slate-800/60 pb-2">
        <div className="flex items-center gap-2">
          <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Activity className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-display uppercase tracking-widest text-slate-200 font-bold">
            Bandwidth Oscilloscope (Mbps)
          </span>
        </div>

        <div className="flex items-center gap-3 text-[10px] font-mono-val">
          <span className="px-2 py-0.5 rounded-md bg-slate-900/90 border border-slate-800 text-slate-400">
            Peak <strong className="text-amber-300">{peakMbps.toFixed(1)}</strong> Mbps
          </span>
          <div className="flex items-center gap-2.5">
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-[2px] rounded-full bg-[#00f3ff] shadow-[0_0_6px_#00f3ff]" />
              <span className="text-cyan-400 font-bold">DL</span>
            </span>
            <span className="flex items-center gap-1">
              <span className="w-2.5 h-[2px] rounded-full bg-[#ec4899] shadow-[0_0_6px_#ec4899]" />
              <span className="text-pink-400 font-bold">UL</span>
            </span>
          </div>
        </div>
      </div>

      <div
        className="relative w-full flex-1 min-h-[120px]"
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      >
        <canvas ref={canvasRef} className="w-full h-full cursor-crosshair" />

        {hoverInfo && (
          <div
            className="absolute top-1 z-20 pointer-events-none bg-slate-950/95 border border-cyan-500/40 rounded-lg px-2.5 py-1.5 text-[10px] font-mono-val shadow-glow-cyan backdrop-blur-md"
            style={{ left: `${hoverInfo.x}px` }}
          >
            <div className="text-slate-500 text-[9px] mb-0.5">{hoverInfo.ago === 0 ? 'NOW' : `-${hoverInfo.ago}s ago`}</div>
            <div className="text-cyan-400 font-bold">▼ {hoverInfo.rxMbps} Mbps</div>
            <div className="text-pink-400 font-bold">▲ {hoverInfo.txMbps} Mbps</div>
          </div>
        )}
      </div>
    </div>
  );
}
