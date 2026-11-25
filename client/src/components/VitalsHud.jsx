import React, { useEffect, useRef, useState } from 'react';
import { Cpu, Zap, HardDrive, Clock } from 'lucide-react';

function MiniSparkline({ points = [], strokeColor, gradientId }) {
  if (points.length < 2) return null;
  const w = 90;
  const h = 28;
  const coords = points.map((v, i) => {
    const x = (i / (points.length - 1)) * w;
    const clamped = Math.max(0, Math.min(100, v));
    const y = h - (clamped / 100) * (h - 4) - 2;
    return [x, y];
  });

  const linePath = coords.map((c, i) => `${i === 0 ? 'M' : 'L'}${c[0].toFixed(1)},${c[1].toFixed(1)}`).join(' ');
  const areaPath = `${linePath} L${w},${h} L0,${h} Z`;

  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="w-24 h-7 overflow-visible opacity-80 group-hover:opacity-100 transition-opacity">
      <defs>
        <linearGradient id={gradientId} x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor={strokeColor} stopOpacity="0.32" />
          <stop offset="100%" stopColor={strokeColor} stopOpacity="0.0" />
        </linearGradient>
      </defs>
      <path d={areaPath} fill={`url(#${gradientId})`} />
      <path
        d={linePath}
        fill="none"
        stroke={strokeColor}
        strokeWidth="1.6"
        strokeLinecap="round"
        strokeLinejoin="round"
        style={{ filter: `drop-shadow(0 0 4px ${strokeColor})` }}
      />
    </svg>
  );
}

function VitalCard({
  icon: Icon, label, tagRight, mainValue, subValue, footerBadge,
  percent, colorClass, hexColor, barFrom, barTo, sparkPoints, sparkId
}) {
  return (
    <div className="cyber-panel p-3.5 md:p-4 rounded-2xl flex flex-col justify-between gap-2.5 group relative overflow-hidden">
      {/* Subtle radial glow on hover */}
      <div
        className="absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none"
        style={{ background: `radial-gradient(circle at 85% 20%, ${hexColor}12 0%, transparent 65%)` }}
      />

      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colorClass} bg-slate-950/70 border border-current/25`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-display uppercase tracking-widest text-slate-300 font-bold">{label}</span>
        </div>
        {tagRight && (
          <span className="text-[10px] font-mono-val px-2 py-0.5 rounded-md bg-slate-950/70 border border-slate-800/70 text-slate-400">
            {tagRight}
          </span>
        )}
      </div>

      <div className="flex items-end justify-between gap-2 relative z-10">
        <div className="min-w-0">
          <div className="flex items-baseline gap-1.5">
            <span className={`text-[24px] md:text-[26px] font-mono-val font-black leading-none tracking-tight ${colorClass}`}>
              {mainValue}
            </span>
            {subValue && <span className="text-[10px] font-mono-val text-slate-500 truncate">{subValue}</span>}
          </div>
          {footerBadge && (
            <div className="text-[9px] font-mono-val text-slate-500 mt-1 truncate">{footerBadge}</div>
          )}
        </div>

        {sparkPoints && sparkPoints.length > 1 && (
          <div className="flex-shrink-0 hidden sm:block">
            <MiniSparkline points={sparkPoints} strokeColor={hexColor} gradientId={sparkId} />
          </div>
        )}
      </div>

      {/* Glow progress bar */}
      <div className="relative z-10 w-full h-1.5 rounded-full bg-slate-950/90 overflow-hidden border border-slate-800/60">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barFrom} ${barTo} transition-all duration-500 ease-out`}
          style={{
            width: `${Math.min(100, Math.max(2, percent || 0))}%`,
            boxShadow: `0 0 10px ${hexColor}66`
          }}
        />
      </div>
    </div>
  );
}

export function VitalsHud({ system = {} }) {
  const cpu = Number(system?.cpu) || 0;
  const mem = system?.memory || {};
  const disk = system?.disk || {};
  const load = Array.isArray(system?.loadavg) ? system.loadavg : [0, 0, 0];
  const l0 = Number(load[0]) || 0;
  const l1 = Number(load[1]) || 0;
  const l2 = Number(load[2]) || 0;
  const baseUptime = Number(system?.uptime) || 0;
  const cores = Number(system?.cores) || 2;
  const arch = system?.hostInfo?.arch || 'x64';

  // Rolling 30-sample mini sparklines
  const historyRef = useRef({ cpu: [], mem: [], load: [] });
  useEffect(() => {
    const h = historyRef.current;
    h.cpu.push(cpu);
    h.mem.push(Number(mem.percent) || 0);
    h.load.push(Math.min(100, (l0 / cores) * 100));
    if (h.cpu.length > 30) h.cpu.shift();
    if (h.mem.length > 30) h.mem.shift();
    if (h.load.length > 30) h.load.shift();
  }, [cpu, mem.percent, l0, cores]);

  // Smooth client-side second counter on top of server uptime
  const [tickOffset, setTickOffset] = useState(0);
  useEffect(() => {
    setTickOffset(0);
    const id = setInterval(() => setTickOffset(t => t + 1), 1000);
    return () => clearInterval(id);
  }, [baseUptime]);

  const fmtBytes = (b) => {
    if (!b) return '0.0 GB';
    const gb = b / 1073741824;
    if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`;
    if (gb < 1) return `${Math.round(b / 1048576)} MB`;
    return `${gb.toFixed(1)} GB`;
  };

  const fmtUp = (s) => {
    const total = Math.max(0, Math.floor(s + tickOffset));
    const d = Math.floor(total / 86400);
    const h = Math.floor((total % 86400) / 3600);
    const m = Math.floor((total % 3600) / 60);
    const sec = total % 60;
    const pad = n => String(n).padStart(2, '0');
    return d > 0 ? `${d}d ${pad(h)}h ${pad(m)}m` : `${pad(h)}h ${pad(m)}m ${pad(sec)}s`;
  };

  const swapFooter = mem.swapTotal > 0
    ? `Swap: ${fmtBytes(mem.swapUsed)} / ${fmtBytes(mem.swapTotal)}`
    : `Available: ${fmtBytes(mem.free)}`;

  const diskFooter = disk.free
    ? `${fmtBytes(disk.free)} free on root`
    : 'Root filesystem';

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <VitalCard
        icon={Cpu}
        label="CPU Load"
        tagRight={`${cores} vCPU • ${arch}`}
        mainValue={`${cpu.toFixed(1)}%`}
        footerBadge={`Load ${l0.toFixed(2)} avg (1m)`}
        percent={cpu}
        colorClass="text-cyan-400"
        hexColor="#00f3ff"
        barFrom="from-cyan-500"
        barTo="to-sky-300"
        sparkPoints={historyRef.current.cpu}
        sparkId="cpuSpark"
      />
      <VitalCard
        icon={Zap}
        label="Memory"
        tagRight={`${(Number(mem.percent) || 0).toFixed(0)}%`}
        mainValue={fmtBytes(mem.used)}
        subValue={`/ ${fmtBytes(mem.total)}`}
        footerBadge={swapFooter}
        percent={Number(mem.percent) || 0}
        colorClass="text-emerald-400"
        hexColor="#10b981"
        barFrom="from-emerald-500"
        barTo="to-teal-300"
        sparkPoints={historyRef.current.mem}
        sparkId="memSpark"
      />
      <VitalCard
        icon={HardDrive}
        label="Storage"
        tagRight={`${Number(disk.percent) || 0}%`}
        mainValue={fmtBytes(disk.used)}
        subValue={`/ ${fmtBytes(disk.total)}`}
        footerBadge={diskFooter}
        percent={Number(disk.percent) || 0}
        colorClass="text-purple-400"
        hexColor="#a855f7"
        barFrom="from-purple-500"
        barTo="to-fuchsia-300"
        sparkPoints={[Number(disk.percent) || 0, Number(disk.percent) || 0]}
        sparkId="diskSpark"
      />
      <VitalCard
        icon={Clock}
        label="System Load"
        tagRight={fmtUp(baseUptime)}
        mainValue={l0.toFixed(2)}
        subValue={`/ ${l1.toFixed(2)} / ${l2.toFixed(2)}`}
        footerBadge={system.hostInfo?.release ? `Kernel ${system.hostInfo.release.split('-')[0]}` : '1m / 5m / 15m load'}
        percent={Math.min(100, (l0 / cores) * 100)}
        colorClass="text-amber-400"
        hexColor="#f59e0b"
        barFrom="from-amber-500"
        barTo="to-yellow-300"
        sparkPoints={historyRef.current.load}
        sparkId="loadSpark"
      />
    </div>
  );
}
