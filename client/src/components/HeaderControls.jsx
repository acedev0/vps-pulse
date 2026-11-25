import React, { useEffect, useState } from 'react';
import { Globe, Radio, Eye, EyeOff, Sparkles, Activity } from 'lucide-react';

export function HeaderControls({
  viewMode, setViewMode,
  streamerMode, setStreamerMode,
  demoMode, toggleDemo,
  status, vps, socketCount = 0
}) {
  const live = status === 'connected';
  const [clock, setClock] = useState(() => new Date().toLocaleTimeString('en-GB', { hour12: false }));

  useEffect(() => {
    const id = setInterval(() => {
      setClock(new Date().toLocaleTimeString('en-GB', { hour12: false }));
    }, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <header className="cyber-panel px-4 md:px-5 py-3 rounded-2xl flex flex-col lg:flex-row items-center justify-between gap-3 relative overflow-hidden">
      {/* Animated top-line accent */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/70 to-transparent" />

      {/* Brand */}
      <div className="flex items-center gap-3.5 w-full lg:w-auto">
        <div className="relative w-10 h-10 flex-shrink-0">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-500/25 via-sky-500/10 to-emerald-500/15 border border-cyan-400/40 flex items-center justify-center shadow-[0_0_15px_rgba(0,243,255,0.2)]">
            <Activity className="w-5 h-5 text-cyan-300" />
          </div>
          <div className="absolute -inset-1 rounded-xl border border-cyan-400/15 animate-ping opacity-20" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5 flex-wrap">
            <h1 className="text-base md:text-lg font-display font-black tracking-[0.16em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-300 via-sky-200 to-emerald-300">
              VPS PULSE
            </h1>
            <span className="text-[9px] font-mono-val px-1.5 py-0.5 rounded-md bg-cyan-950/70 border border-cyan-600/40 text-cyan-300 font-bold tracking-wider">
              v3.1
            </span>
            {vps?.hostname && vps.hostname !== 'localhost' && (
              <span className="text-[10px] font-mono-val px-2 py-0.5 rounded-md bg-slate-900/90 border border-slate-800 text-slate-300 font-semibold hidden sm:inline">
                {vps.hostname}
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono-val text-slate-400 mt-0.5 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-400 led-pulse' : 'bg-rose-500'}`} style={{ color: live ? '#10b981' : '#ef4444' }} />
              <span className={live ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                {live ? 'LIVE TELEMETRY' : 'RECONNECTING'}
              </span>
            </span>
            <span className="text-slate-700">│</span>
            <span className="text-slate-300 font-semibold">
              {streamerMode ? '***.***.***.***' : (vps?.ip || 'Detecting IP...')}
            </span>
            <span className="text-slate-700">│</span>
            <span className="text-cyan-400">{vps?.flag} {vps?.city || 'Host Node'}</span>
            <span className="text-slate-700 hidden sm:inline">│</span>
            <span className="text-slate-500 truncate max-w-[220px] hidden sm:inline">{vps?.org || 'Primary Network'}</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
        <span className="hidden xl:inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-slate-950/70 border border-slate-800/60 text-[10px] font-mono-val text-slate-400">
          <span className="w-1.5 h-1.5 rounded-full bg-cyan-400" />
          <span>{socketCount} STREAMS</span>
          <span className="text-slate-700">│</span>
          <span className="text-slate-300">{clock}</span>
        </span>

        {/* View Mode */}
        <div className="flex bg-slate-950/75 p-0.5 rounded-lg border border-slate-800/60">
          <button
            onClick={() => setViewMode('globe')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 text-[10px] font-mono-val transition-all
              ${viewMode === 'globe'
                ? 'bg-cyan-500/15 text-cyan-300 font-bold box-glow-cyan'
                : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Globe className="w-3.5 h-3.5" /> 3D Earth
          </button>
          <button
            onClick={() => setViewMode('orbit')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 text-[10px] font-mono-val transition-all
              ${viewMode === 'orbit'
                ? 'bg-cyan-500/15 text-cyan-300 font-bold box-glow-cyan'
                : 'text-slate-400 hover:text-slate-200'}`}
          >
            <Radio className="w-3.5 h-3.5" /> Radar
          </button>
        </div>

        {/* Streamer Privacy Mode */}
        <button
          onClick={() => setStreamerMode(!streamerMode)}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-mono-val border flex items-center gap-1.5 transition-all
            ${streamerMode
              ? 'bg-purple-950/50 border-purple-500/50 text-purple-200 box-glow-cyan'
              : 'bg-slate-950/50 border-slate-800/60 text-slate-400 hover:text-slate-200 hover:border-slate-700'}`}
        >
          {streamerMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{streamerMode ? 'Privacy ON' : 'Privacy'}</span>
        </button>

        {/* Live vs Simulation */}
        <button
          onClick={toggleDemo}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-mono-val border flex items-center gap-1.5 transition-all
            ${demoMode
              ? 'bg-amber-950/50 border-amber-500/50 text-amber-300 box-glow-amber'
              : 'bg-slate-950/50 border-slate-800/60 text-slate-400 hover:text-slate-200 hover:border-slate-700'}`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {demoMode ? 'Demo' : 'Live'}
        </button>
      </div>
    </header>
  );
}
