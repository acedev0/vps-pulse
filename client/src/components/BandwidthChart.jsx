import React, { useEffect, useRef, useState } from 'react';
import { Activity } from 'lucide-react';

export function BandwidthChart({ history = [] }) {
  const canvasRef = useRef(null);
  const historyRef = useRef(history);
  historyRef.current = history;

  // Running smooth interpolation buffer
  const smoothPointsRef = useRef([]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    let animId;

    const render = () => {
      animId = requestAnimationFrame(render);

      const dpr = Math.min(window.devicePixelRatio, 2);
      const rect = canvas.parentElement.getBoundingClientRect();
      const W = rect.width;
      const H = rect.height;
      if (W === 0 || H === 0) return;

      if (canvas.width !== W * dpr || canvas.height !== H * dpr) {
        canvas.width = W * dpr;
        canvas.height = H * dpr;
        canvas.style.width = W + 'px';
        canvas.style.height = H + 'px';
      }

      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, W, H);

      const raw = historyRef.current;
      // Convert raw history to Mbps: (bytes * 8) / 1,000,000
      const currentPoints = raw.map(p => ({
        rxMbps: (p.rx * 8) / 1000000,
        txMbps: (p.tx * 8) / 1000000
      }));

      // Initialize or smoothly interpolate towards target points
      if (smoothPointsRef.current.length !== currentPoints.length) {
        smoothPointsRef.current = currentPoints.map(p => ({ ...p }));
      } else {
        for (let i = 0; i < currentPoints.length; i++) {
          smoothPointsRef.current[i].rxMbps += (currentPoints[i].rxMbps - smoothPointsRef.current[i].rxMbps) * 0.12;
          smoothPointsRef.current[i].txMbps += (currentPoints[i].txMbps - smoothPointsRef.current[i].txMbps) * 0.12;
        }
      }

      const pts = smoothPointsRef.current.length > 1
        ? smoothPointsRef.current
        : [{ rxMbps: 0, txMbps: 0 }, { rxMbps: 0, txMbps: 0 }];

      // Dynamic scale in Mbps (minimum 25 Mbps ceiling)
      const maxMbps = Math.max(
        25,
        ...pts.map(p => Math.max(p.rxMbps, p.txMbps))
      ) * 1.15;

      const pad = { top: 10, bottom: 6, left: 4, right: 4 };
      const plotW = W - pad.left - pad.right;
      const plotH = H - pad.top - pad.bottom;

      // Draw subtle oscilloscope grid lines
      ctx.strokeStyle = 'rgba(0, 243, 255, 0.08)';
      ctx.lineWidth = 0.5;
      for (let i = 1; i <= 3; i++) {
        const y = pad.top + (plotH * i) / 4;
        ctx.beginPath();
        ctx.setLineDash([3, 5]);
        ctx.moveTo(pad.left, y);
        ctx.lineTo(W - pad.right, y);
        ctx.stroke();
      }
      ctx.setLineDash([]);

      const getX = (i) => pad.left + (i / Math.max(1, pts.length - 1)) * plotW;
      const getY = (v) => pad.top + plotH - (v / maxMbps) * plotH;

      // Draw Wave function
      const drawWave = (key, lineColor, gradStopColor) => {
        // Gradient fill
        const areaGrad = ctx.createLinearGradient(0, pad.top, 0, H);
        areaGrad.addColorStop(0, gradStopColor.replace('1)', '0.35)'));
        areaGrad.addColorStop(0.5, gradStopColor.replace('1)', '0.08)'));
        areaGrad.addColorStop(1, 'transparent');

        ctx.beginPath();
        ctx.moveTo(getX(0), H - pad.bottom);
        for (let i = 0; i < pts.length; i++) {
          const x = getX(i);
          const y = getY(pts[i][key]);
          if (i === 0) ctx.lineTo(x, y);
          else {
            const prevX = getX(i - 1);
            const cpx = (prevX + x) / 2;
            ctx.bezierCurveTo(cpx, getY(pts[i - 1][key]), cpx, y, x, y);
          }
        }
        ctx.lineTo(getX(pts.length - 1), H - pad.bottom);
        ctx.closePath();
        ctx.fillStyle = areaGrad;
        ctx.fill();

        // Neon line with glow
        ctx.shadowColor = lineColor;
        ctx.shadowBlur = 10;
        ctx.strokeStyle = lineColor;
        ctx.lineWidth = 2.2;
        ctx.lineJoin = 'round';
        ctx.beginPath();
        for (let i = 0; i < pts.length; i++) {
          const x = getX(i);
          const y = getY(pts[i][key]);
          if (i === 0) ctx.moveTo(x, y);
          else {
            const prevX = getX(i - 1);
            const cpx = (prevX + x) / 2;
            ctx.bezierCurveTo(cpx, getY(pts[i - 1][key]), cpx, y, x, y);
          }
        }
        ctx.stroke();
        ctx.shadowBlur = 0;

        // Glowing tracer dot on the latest point
        if (pts.length > 0) {
          const lastX = getX(pts.length - 1);
          const lastY = getY(pts[pts.length - 1][key]);
          ctx.fillStyle = lineColor;
          ctx.shadowColor = lineColor;
          ctx.shadowBlur = 14;
          ctx.beginPath();
          ctx.arc(lastX, lastY, 3.5, 0, Math.PI * 2);
          ctx.fill();
          ctx.shadowBlur = 0;
        }
      };

      // TX first (behind), then RX
      drawWave('txMbps', '#ec4899', 'rgba(236, 72, 153, 1)');
      drawWave('rxMbps', '#00f3ff', 'rgba(0, 243, 255, 1)');
    };

    render();

    return () => cancelAnimationFrame(animId);
  }, []);

  const formatPeak = (pts) => {
    const maxBytes = Math.max(0, ...pts.map(p => Math.max(p.rx, p.tx)));
    const maxMbps = (maxBytes * 8) / 1000000;
    return `${maxMbps.toFixed(1)} Mbps`;
  };

  return (
    <div className="cyber-panel p-4 rounded-2xl flex flex-col gap-2.5 border border-slate-800">
      <div className="flex items-center justify-between border-b border-slate-800/60 pb-2">
        <div className="flex items-center gap-2">
          <Activity className="w-4 h-4 text-cyan-400" />
          <span className="text-[11px] font-display uppercase tracking-widest text-slate-300 font-bold">
            60s Bandwidth Oscilloscope (Mbps)
          </span>
        </div>
        <div className="flex items-center gap-4 text-[10px] font-mono-val">
          <span className="text-slate-500">
            Peak: <span className="text-white font-bold">{formatPeak(history)}</span>
          </span>
          <div className="flex items-center gap-3">
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-[2px] rounded-full bg-[#00f3ff] inline-block shadow-[0_0_6px_#00f3ff]" />
              <span className="text-cyan-400 font-semibold">DOWNLOAD</span>
            </span>
            <span className="flex items-center gap-1.5">
              <span className="w-3 h-[2px] rounded-full bg-[#ec4899] inline-block shadow-[0_0_6px_#ec4899]" />
              <span className="text-pink-400 font-semibold">UPLOAD</span>
            </span>
          </div>
        </div>
      </div>

      <div className="relative w-full h-28">
        <canvas ref={canvasRef} className="w-full h-full" />
      </div>
    </div>
  );
}
