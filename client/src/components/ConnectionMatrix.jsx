import React, { useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Search, Globe } from 'lucide-react';

export function ConnectionMatrix({ sockets = [], streamerMode = false }) {
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');

  const maskIp = (ip) => {
    if (!streamerMode || !ip) return ip;
    const p = ip.split('.');
    if (p.length === 4) return `${p[0]}.${p[1]}.***.***`;
    return ip;
  };

  const fmtSpeed = (b) => {
    if (!b) return '0.0 Mbps';
    const mbps = (b * 8) / 1000000;
    if (mbps < 0.1) return `${((b * 8) / 1000).toFixed(0)} Kbps`;
    return `${mbps.toFixed(1)} Mbps`;
  };

  const filtered = sockets.filter(s => {
    if (filter !== 'all' && s.direction !== filter) return false;
    if (search.trim()) {
      const q = search.toLowerCase();
      return [s.remoteIp, s.geo?.city, s.geo?.org, s.process, s.geo?.country]
        .some(v => v?.toLowerCase().includes(q));
    }
    return true;
  });

  const inC = sockets.filter(s => s.direction === 'inbound').length;
  const outC = sockets.filter(s => s.direction === 'outbound').length;

  const FilterBtn = ({ value, label, count, icon: Icon, activeClass }) => (
    <button
      onClick={() => setFilter(value)}
      className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-all text-[10px] font-mono-val
        ${filter === value
          ? `${activeClass} font-bold`
          : 'text-slate-500 hover:text-slate-300'
        }`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {label} <span className="opacity-60">({count})</span>
    </button>
  );

  return (
    <div className="cyber-panel p-4 rounded-2xl flex flex-col gap-3 border border-slate-800">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <Globe className="w-4 h-4 text-cyan-400" />
          <span className="text-[11px] font-display uppercase tracking-widest text-slate-200 font-bold">
            Live Stream Matrix (Uploaded / Downloaded & Where)
          </span>
          <span className="text-[10px] font-mono-val px-2 py-0.5 rounded-full bg-cyan-950/50 border border-cyan-800/40 text-cyan-300 font-bold">
            {sockets.length} active
          </span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto">
          <div className="relative flex-1 sm:w-44">
            <Search className="w-3 h-3 text-slate-600 absolute left-2.5 top-2.5" />
            <input
              type="text" placeholder="Search IP, org, proc..." value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800/60 rounded-lg pl-7 pr-3 py-1.5 text-[10px] font-mono-val text-slate-300 placeholder-slate-700 focus:outline-none focus:border-cyan-700/60 transition-colors"
            />
          </div>
          <div className="flex bg-slate-950/60 p-0.5 rounded-lg border border-slate-800/40">
            <FilterBtn value="all" label="All" count={sockets.length} activeClass="bg-cyan-500/15 text-cyan-300" />
            <FilterBtn value="inbound" label="DL" count={inC} icon={ArrowDownLeft} activeClass="bg-cyan-500/15 text-cyan-300" />
            <FilterBtn value="outbound" label="UL" count={outC} icon={ArrowUpRight} activeClass="bg-pink-500/15 text-pink-300" />
          </div>
        </div>
      </div>

      {/* Table */}
      <div className="overflow-auto max-h-[340px] rounded-xl border border-slate-800/40">
        <table className="w-full text-left">
          <thead className="bg-slate-950/90 sticky top-0 z-10 border-b border-slate-800/60">
            <tr className="text-[9px] font-display uppercase tracking-[0.2em] text-slate-500">
              <th className="py-2.5 px-3">Flow</th>
              <th className="py-2.5 px-3">Location & Organization</th>
              <th className="py-2.5 px-3">Remote Endpoint</th>
              <th className="py-2.5 px-3">Process</th>
              <th className="py-2.5 px-3 text-right">Speed (Mbps)</th>
              <th className="py-2.5 px-3 text-right">Proto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/20">
            {filtered.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-600 font-mono-val text-xs">No active connections match filter.</td></tr>
            ) : filtered.map((s) => {
              const isIn = s.direction === 'inbound';
              return (
                <tr key={s.id} className="hover:bg-slate-900/40 transition-colors">
                  <td className="py-2 px-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-mono-val font-bold border
                      ${isIn
                        ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/20'
                        : 'bg-pink-500/10 text-pink-300 border-pink-500/20'
                      }`}
                    >
                      {isIn
                        ? <><ArrowDownLeft className="w-2.5 h-2.5" /><span>DOWNLOAD</span></>
                        : <><ArrowUpRight className="w-2.5 h-2.5" /><span>UPLOAD</span></>
                      }
                    </span>
                  </td>

                  <td className="py-2 px-3">
                    <div className="flex items-center gap-2">
                      <span className="text-sm">{s.geo?.flag || '🌐'}</span>
                      <div className="flex flex-col leading-tight">
                        <span className="text-[11px] text-slate-200 font-semibold">{s.geo?.city || 'Unknown'}, {s.geo?.country}</span>
                        <span className="text-[9px] text-cyan-400/80 font-mono-val truncate max-w-[200px]">{s.geo?.org || 'Public Transit'}</span>
                      </div>
                    </div>
                  </td>

                  <td className="py-2 px-3 font-mono-val text-[11px]">
                    <span className="text-slate-300">{maskIp(s.remoteIp)}</span>
                    <span className="text-slate-600">:{s.remotePort}</span>
                  </td>

                  <td className="py-2 px-3">
                    <span className="text-[10px] font-mono-val px-1.5 py-0.5 rounded bg-purple-950/40 text-purple-300 border border-purple-800/30">
                      {s.process}
                    </span>
                  </td>

                  <td className="py-2 px-3 text-right font-mono-val text-[11px] font-bold">
                    <span className={isIn ? 'text-cyan-400' : 'text-pink-400'}>
                      {fmtSpeed(s.speed)}
                    </span>
                  </td>

                  <td className="py-2 px-3 text-right text-[10px] font-mono-val text-slate-600">
                    {s.protocol}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}
