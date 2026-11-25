import React, { useMemo, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Search, Globe, Layers, List } from 'lucide-react';

export function ConnectionMatrix({ sockets = [], streamerMode = false }) {
  const [filter, setFilter] = useState('all');
  const [groupMode, setGroupMode] = useState('grouped'); // 'grouped' | 'raw'
  const [search, setSearch] = useState('');

  const maskIp = (ip) => {
    if (!ip) return '';
    const cleaned = ip.replace(/^::ffff:/, '');
    if (!streamerMode) return cleaned;
    const p = cleaned.split('.');
    if (p.length === 4) return `${p[0]}.${p[1]}.***.***`;
    return cleaned;
  };

  const fmtSpeed = (b) => {
    if (!b) return '0.0 Mbps';
    const mbps = (b * 8) / 1000000;
    if (mbps < 0.1) return `${((b * 8) / 1000).toFixed(0)} Kbps`;
    return `${mbps.toFixed(1)} Mbps`;
  };

  // Top Download Sources & Upload Destinations summary cards
  const { topDownloads, topUploads } = useMemo(() => {
    const summarize = (dir) => {
      const map = new Map();
      let totalBps = 0;
      for (const s of sockets) {
        if (s.direction !== dir || s.geo?.isLocal) continue;
        const label = s.geo?.city && s.geo.city !== 'Unknown City'
          ? `${s.geo.city}, ${s.geo.country}`
          : (s.geo?.org || s.geo?.country || 'Global');
        const key = `${label}::${s.geo?.flag || ''}`;
        const prev = map.get(key) || { label, flag: s.geo?.flag || '🌐', org: s.geo?.org || '', speed: 0, count: 0 };
        prev.speed += s.speed || 0;
        prev.count += 1;
        totalBps += s.speed || 0;
        map.set(key, prev);
      }
      const list = Array.from(map.values()).sort((a, b) => b.speed - a.speed).slice(0, 3);
      return { list, maxBps: list[0]?.speed || 1, totalBps };
    };
    return {
      topDownloads: summarize('inbound'),
      topUploads: summarize('outbound')
    };
  }, [sockets]);

  // Group sockets by Remote IP + Direction + Process when in 'grouped' mode
  const rows = useMemo(() => {
    const baseList = groupMode === 'raw'
      ? sockets.map(s => ({ ...s, count: 1 }))
      : (() => {
          const gMap = new Map();
          for (const s of sockets) {
            const cleanIp = (s.remoteIp || '').replace(/^::ffff:/, '');
            const key = `${s.direction}_${cleanIp}_${s.process}`;
            let cur = gMap.get(key);
            if (!cur) {
              cur = {
                ...s,
                id: key,
                cleanIp,
                count: 1,
                ports: [s.remotePort],
                speed: s.speed || 0
              };
              gMap.set(key, cur);
            } else {
              cur.count += 1;
              cur.speed += s.speed || 0;
              if (cur.ports.length < 3 && !cur.ports.includes(s.remotePort)) {
                cur.ports.push(s.remotePort);
              }
            }
          }
          return Array.from(gMap.values()).sort((a, b) => b.speed - a.speed);
        })();

    return baseList.filter(s => {
      if (filter !== 'all' && s.direction !== filter) return false;
      if (search.trim()) {
        const q = search.toLowerCase();
        return [s.remoteIp, s.geo?.city, s.geo?.org, s.process, s.geo?.country]
          .some(v => v?.toLowerCase().includes(q));
      }
      return true;
    });
  }, [sockets, groupMode, filter, search]);

  const inC = sockets.filter(s => s.direction === 'inbound').length;
  const outC = sockets.filter(s => s.direction === 'outbound').length;
  const maxRowSpeed = rows[0]?.speed || 1;

  const FilterBtn = ({ value, label, count, icon: Icon, activeClass }) => (
    <button
      onClick={() => setFilter(value)}
      className={`px-2.5 py-1 rounded-md flex items-center gap-1 transition-all text-[10px] font-mono-val
        ${filter === value ? `${activeClass} font-bold` : 'text-slate-500 hover:text-slate-300'}`}
    >
      {Icon && <Icon className="w-3 h-3" />}
      {label} <span className="opacity-65">({count})</span>
    </button>
  );

  const TopFlowColumn = ({ title, icon: Icon, summary, isDown }) => (
    <div className="bg-slate-950/60 border border-slate-800/60 rounded-xl p-3 flex flex-col gap-2">
      <div className="flex items-center justify-between text-[10px] font-display uppercase tracking-widest">
        <span className={`flex items-center gap-1.5 font-bold ${isDown ? 'text-cyan-400' : 'text-pink-400'}`}>
          <Icon className="w-3.5 h-3.5" />
          {title}
        </span>
        <span className="font-mono-val text-slate-400">
          Total: <strong className="text-slate-200">{fmtSpeed(summary.totalBps)}</strong>
        </span>
      </div>
      {summary.list.length === 0 ? (
        <div className="text-[10px] font-mono-val text-slate-600 py-1">No active remote flows</div>
      ) : (
        <div className="space-y-1.5">
          {summary.list.map((item, idx) => {
            const pct = Math.max(6, Math.round((item.speed / summary.maxBps) * 100));
            return (
              <div key={idx} className="relative overflow-hidden rounded-lg bg-slate-900/50 px-2.5 py-1.5 border border-slate-800/40">
                <div
                  className={`absolute inset-y-0 left-0 opacity-15 transition-all duration-500 ${isDown ? 'bg-cyan-400' : 'bg-pink-400'}`}
                  style={{ width: `${pct}%` }}
                />
                <div className="relative z-10 flex items-center justify-between text-[10px] font-mono-val">
                  <div className="flex items-center gap-2 min-w-0">
                    <span>{item.flag}</span>
                    <span className="text-slate-200 font-semibold truncate">{item.label}</span>
                    <span className="text-[9px] px-1.5 py-0.2 rounded bg-slate-950/80 text-slate-400 border border-slate-800">
                      ×{item.count}
                    </span>
                  </div>
                  <span className={`font-bold flex-shrink-0 ml-2 ${isDown ? 'text-cyan-300' : 'text-pink-300'}`}>
                    {fmtSpeed(item.speed)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );

  return (
    <div className="cyber-panel p-4 rounded-2xl flex flex-col gap-3">
      {/* Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="flex items-center gap-2.5">
          <div className="w-6 h-6 rounded-lg bg-cyan-500/10 border border-cyan-500/30 flex items-center justify-center text-cyan-400">
            <Globe className="w-3.5 h-3.5" />
          </div>
          <span className="text-[11px] font-display uppercase tracking-widest text-slate-200 font-bold">
            Live Stream Matrix (Traffic & Destinations)
          </span>
          <span className="text-[10px] font-mono-val px-2 py-0.5 rounded-full bg-cyan-950/50 border border-cyan-800/40 text-cyan-300 font-bold">
            {sockets.length} sockets
          </span>
        </div>

        <div className="flex flex-wrap items-center gap-2 w-full md:w-auto justify-end">
          <div className="relative flex-1 sm:w-44">
            <Search className="w-3 h-3 text-slate-500 absolute left-2.5 top-2.5" />
            <input
              type="text"
              placeholder="Search IP, city, proc..."
              value={search}
              onChange={e => setSearch(e.target.value)}
              className="w-full bg-slate-950/80 border border-slate-800/60 rounded-lg pl-7 pr-3 py-1.5 text-[10px] font-mono-val text-slate-300 placeholder-slate-600 focus:outline-none focus:border-cyan-500/50 transition-colors"
            />
          </div>

          {/* Group vs Raw Toggle */}
          <div className="flex bg-slate-950/60 p-0.5 rounded-lg border border-slate-800/50">
            <button
              onClick={() => setGroupMode('grouped')}
              className={`px-2 py-1 rounded-md flex items-center gap-1 text-[10px] font-mono-val transition-all
                ${groupMode === 'grouped' ? 'bg-purple-500/20 text-purple-300 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <Layers className="w-3 h-3" /> Grouped
            </button>
            <button
              onClick={() => setGroupMode('raw')}
              className={`px-2 py-1 rounded-md flex items-center gap-1 text-[10px] font-mono-val transition-all
                ${groupMode === 'raw' ? 'bg-purple-500/20 text-purple-300 font-bold' : 'text-slate-500 hover:text-slate-300'}`}
            >
              <List className="w-3 h-3" /> Ports
            </button>
          </div>

          <div className="flex bg-slate-950/60 p-0.5 rounded-lg border border-slate-800/50">
            <FilterBtn value="all" label="All" count={sockets.length} activeClass="bg-cyan-500/15 text-cyan-300" />
            <FilterBtn value="inbound" label="DL" count={inC} icon={ArrowDownLeft} activeClass="bg-cyan-500/15 text-cyan-300" />
            <FilterBtn value="outbound" label="UL" count={outC} icon={ArrowUpRight} activeClass="bg-pink-500/15 text-pink-300" />
          </div>
        </div>
      </div>

      {/* Top Upload & Download Geo Summary */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <TopFlowColumn title="Top Download Sources (Where From)" icon={ArrowDownLeft} summary={topDownloads} isDown={true} />
        <TopFlowColumn title="Top Upload Destinations (Where To)" icon={ArrowUpRight} summary={topUploads} isDown={false} />
      </div>

      {/* Socket Table */}
      <div className="overflow-auto max-h-[340px] rounded-xl border border-slate-800/50 bg-[#050a15]">
        <table className="w-full text-left border-collapse">
          <thead className="bg-[#070d1c] sticky top-0 z-10 border-b border-slate-800/80 shadow-sm">
            <tr className="text-[9px] font-display uppercase tracking-[0.2em] text-slate-500">
              <th className="py-2.5 px-3">Flow</th>
              <th className="py-2.5 px-3">Location & Organization</th>
              <th className="py-2.5 px-3">Remote Endpoint</th>
              <th className="py-2.5 px-3">Process</th>
              <th className="py-2.5 px-3 text-right">Speed (Mbps)</th>
              <th className="py-2.5 px-3 text-right">Proto</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-800/25">
            {rows.length === 0 ? (
              <tr><td colSpan={6} className="py-10 text-center text-slate-600 font-mono-val text-xs">No active connections match filter.</td></tr>
            ) : rows.map((s) => {
              const isIn = s.direction === 'inbound';
              const barPct = Math.max(4, Math.min(100, Math.round((s.speed / maxRowSpeed) * 100)));
              return (
                <tr key={s.id} className="hover:bg-slate-900/50 transition-colors">
                  <td className="py-2 px-3">
                    <span className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-md text-[9px] font-mono-val font-bold border
                      ${isIn
                        ? 'bg-cyan-500/10 text-cyan-300 border-cyan-500/25'
                        : 'bg-pink-500/10 text-pink-300 border-pink-500/25'
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
                        <span className="text-[11px] text-slate-200 font-semibold">
                          {s.geo?.city && s.geo.city !== 'Unknown City' ? s.geo.city : (s.geo?.org || 'Edge Node')}, {s.geo?.country}
                        </span>
                        <span className="text-[9px] text-cyan-400/80 font-mono-val truncate max-w-[200px]">{s.geo?.org || 'Public Transit'}</span>
                      </div>
                    </div>
                  </td>

                  <td className="py-2 px-3 font-mono-val text-[11px]">
                    <span className="text-slate-200">{maskIp(s.remoteIp)}</span>
                    {groupMode === 'grouped' && s.count > 1 ? (
                      <span className="ml-1.5 text-[9px] px-1.5 py-0.5 rounded bg-slate-800/80 text-cyan-300 font-bold">
                        ×{s.count}
                      </span>
                    ) : (
                      <span className="text-slate-500">:{s.remotePort}</span>
                    )}
                  </td>

                  <td className="py-2 px-3">
                    <span className="text-[10px] font-mono-val px-1.5 py-0.5 rounded bg-purple-950/40 text-purple-300 border border-purple-800/30">
                      {s.process}
                    </span>
                  </td>

                  <td className="py-2 px-3 text-right font-mono-val text-[11px] font-bold">
                    <div className="inline-flex items-center gap-2 justify-end">
                      <div className="w-12 h-1.5 rounded-full bg-slate-900 overflow-hidden hidden sm:block">
                        <div
                          className={`h-full rounded-full ${isIn ? 'bg-cyan-400' : 'bg-pink-400'}`}
                          style={{ width: `${barPct}%` }}
                        />
                      </div>
                      <span className={isIn ? 'text-cyan-400' : 'text-pink-400'}>
                        {fmtSpeed(s.speed)}
                      </span>
                    </div>
                  </td>

                  <td className="py-2 px-3 text-right text-[10px] font-mono-val text-slate-500">
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
