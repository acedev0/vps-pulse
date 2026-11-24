import React from 'react';
import { Cpu, Zap, HardDrive, Clock } from 'lucide-react';

function VitalCard({ icon: Icon, label, tagRight, mainValue, subValue, percent, colorClass, barFrom, barTo }) {
  return (
    <div className="cyber-panel p-4 rounded-2xl flex flex-col gap-2.5 group relative overflow-hidden">
      {/* Subtle background glow on hover */}
      <div className={`absolute inset-0 opacity-0 group-hover:opacity-100 transition-opacity duration-500 pointer-events-none
        bg-gradient-to-br ${barFrom === 'from-cyan-500' ? 'from-cyan-500/5' : barFrom === 'from-emerald-500' ? 'from-emerald-500/5' : barFrom === 'from-purple-500' ? 'from-purple-500/5' : 'from-amber-500/5'} to-transparent`} />

      <div className="flex items-center justify-between relative z-10">
        <div className="flex items-center gap-2">
          <div className={`w-7 h-7 rounded-lg flex items-center justify-center ${colorClass} bg-opacity-10 border border-current/20`}>
            <Icon className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-display uppercase tracking-widest text-slate-400">{label}</span>
        </div>
        {tagRight && (
          <span className="text-[10px] font-mono-val text-slate-500">{tagRight}</span>
        )}
      </div>

      <div className="flex items-baseline gap-1.5 relative z-10">
        <span className={`text-[26px] font-mono-val font-black leading-none ${colorClass}`}>
          {mainValue}
        </span>
        {subValue && <span className="text-[11px] font-mono-val text-slate-600">{subValue}</span>}
      </div>

      {/* Progress bar with glow */}
      <div className="relative z-10 w-full h-1.5 rounded-full bg-slate-900/80 overflow-hidden border border-slate-800/40">
        <div
          className={`h-full rounded-full bg-gradient-to-r ${barFrom} ${barTo} transition-all duration-500 ease-out`}
          style={{
            width: `${Math.min(100, Math.max(2, percent))}%`,
            boxShadow: `0 0 10px ${barFrom.includes('cyan') ? 'rgba(0,243,255,0.4)' : barFrom.includes('emerald') ? 'rgba(16,185,129,0.4)' : barFrom.includes('purple') ? 'rgba(168,85,247,0.4)' : 'rgba(245,158,11,0.4)'}`
          }}
        />
      </div>
    </div>
  );
}

export function VitalsHud({ system = {}, vps = {} }) {
  const cpu = system.cpu || 0;
  const mem = system.memory || {};
  const disk = system.disk || {};
  const load = system.loadavg || [0, 0, 0];
  const uptime = system.uptime || 0;

  const fmtBytes = (b) => {
    if (!b) return '0';
    const gb = b / 1073741824;
    if (gb >= 1000) return `${(gb / 1024).toFixed(1)} TB`;
    return `${gb.toFixed(1)} GB`;
  };

  const fmtUp = (s) => {
    const d = Math.floor(s / 86400);
    const h = Math.floor((s % 86400) / 3600);
    return `${d}d ${h}h`;
  };

  return (
    <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
      <VitalCard
        icon={Cpu} label="CPU Load" tagRight={`${system.cores || 4} Cores`}
        mainValue={`${cpu.toFixed(1)}%`} percent={cpu}
        colorClass="text-cyan-400" barFrom="from-cyan-500" barTo="to-cyan-300"
      />
      <VitalCard
        icon={Zap} label="Memory" tagRight={`${(mem.percent || 0).toFixed(0)}%`}
        mainValue={fmtBytes(mem.used)} subValue={`/ ${fmtBytes(mem.total)}`} percent={mem.percent || 0}
        colorClass="text-emerald-400" barFrom="from-emerald-500" barTo="to-emerald-300"
      />
      <VitalCard
        icon={HardDrive} label="Storage" tagRight={`${disk.percent || 0}%`}
        mainValue={fmtBytes(disk.used)} subValue={`/ ${fmtBytes(disk.total)}`} percent={disk.percent || 0}
        colorClass="text-purple-400" barFrom="from-purple-500" barTo="to-purple-300"
      />
      <VitalCard
        icon={Clock} label="Uptime" tagRight={fmtUp(uptime)}
        mainValue={load[0]?.toString() || '0'} subValue={`/ ${load[1]} / ${load[2]}`} percent={Math.min(100, (load[0] / (system.cores || 4)) * 100)}
        colorClass="text-amber-400" barFrom="from-amber-500" barTo="to-amber-300"
      />
    </div>
  );
}
