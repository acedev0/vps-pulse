import React from 'react';
import { Globe, Radio, Eye, EyeOff, Sparkles, Activity, Wifi } from 'lucide-react';

export function HeaderControls({
  viewMode, setViewMode,
  streamerMode, setStreamerMode,
  demoMode, toggleDemo,
  status, vps
}) {
  const live = status === 'connected';

  return (
    <header className="cyber-panel px-5 py-3.5 rounded-2xl flex flex-col lg:flex-row items-center justify-between gap-4 relative overflow-hidden">
      {/* Animated top-line accent */}
      <div className="absolute top-0 left-0 right-0 h-[1px] bg-gradient-to-r from-transparent via-cyan-400/60 to-transparent" />

      {/* Brand */}
      <div className="flex items-center gap-4 w-full lg:w-auto">
        {/* Animated logo container */}
        <div className="relative w-11 h-11 flex-shrink-0">
          <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-cyan-500/20 to-cyan-500/5 border border-cyan-500/30 flex items-center justify-center">
            <Activity className="w-5 h-5 text-cyan-400" />
          </div>
          <div className="absolute -inset-1 rounded-xl border border-cyan-500/10 animate-ping opacity-20" />
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2.5">
            <h1 className="text-lg font-display font-black tracking-[0.15em] text-transparent bg-clip-text bg-gradient-to-r from-cyan-400 via-teal-300 to-emerald-400">
              VPS PULSE
            </h1>
            <span className="text-[9px] font-mono-val px-1.5 py-0.5 rounded-md bg-cyan-950/60 border border-cyan-700/40 text-cyan-400 font-bold tracking-wider">
              v3.0
            </span>
          </div>
          <div className="flex items-center gap-2 text-[10px] font-mono-val text-slate-500 mt-0.5 flex-wrap">
            <span className="flex items-center gap-1.5">
              <span className={`w-1.5 h-1.5 rounded-full ${live ? 'bg-emerald-400 led-pulse' : 'bg-rose-500'}`} style={{ color: live ? '#10b981' : '#ef4444' }} />
              <span className={live ? 'text-emerald-400 font-bold' : 'text-rose-400'}>
                {live ? 'LIVE STREAM' : 'RECONNECTING'}
              </span>
            </span>
            <span className="text-slate-800">│</span>
            <span className="text-slate-400 font-semibold truncate">
              {vps?.ip || '139.162.52.81'}
            </span>
            <span className="text-slate-800">│</span>
            <span className="text-cyan-500/80">{vps?.flag} {vps?.city || 'Singapore'}</span>
            <span className="text-slate-800">│</span>
            <span className="text-slate-600">{vps?.org || 'Linode'}</span>
          </div>
        </div>
      </div>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2 w-full lg:w-auto justify-end">
        {/* View Mode */}
        <div className="flex bg-slate-950/60 p-0.5 rounded-lg border border-slate-800/40">
          <button onClick={() => setViewMode('globe')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 text-[10px] font-mono-val transition-all
              ${viewMode === 'globe'
                ? 'bg-cyan-500/15 text-cyan-300 font-bold box-glow-cyan'
                : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Globe className="w-3.5 h-3.5" /> 3D Globe
          </button>
          <button onClick={() => setViewMode('orbit')}
            className={`px-3 py-1.5 rounded-md flex items-center gap-1.5 text-[10px] font-mono-val transition-all
              ${viewMode === 'orbit'
                ? 'bg-cyan-500/15 text-cyan-300 font-bold box-glow-cyan'
                : 'text-slate-500 hover:text-slate-300'}`}
          >
            <Radio className="w-3.5 h-3.5" /> Radar
          </button>
        </div>

        {/* Streamer Mode */}
        <button onClick={() => setStreamerMode(!streamerMode)}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-mono-val border flex items-center gap-1.5 transition-all
            ${streamerMode
              ? 'bg-purple-950/40 border-purple-600/50 text-purple-300 box-glow-cyan'
              : 'bg-transparent border-slate-800/40 text-slate-500 hover:text-slate-300 hover:border-slate-700'}`}
        >
          {streamerMode ? <EyeOff className="w-3.5 h-3.5" /> : <Eye className="w-3.5 h-3.5" />}
          <span className="hidden sm:inline">{streamerMode ? 'Privacy ON' : 'Privacy'}</span>
        </button>

        {/* Demo */}
        <button onClick={toggleDemo}
          className={`px-3 py-1.5 rounded-lg text-[10px] font-mono-val border flex items-center gap-1.5 transition-all
            ${demoMode
              ? 'bg-amber-950/40 border-amber-500/50 text-amber-300 box-glow-amber'
              : 'bg-transparent border-slate-800/40 text-slate-500 hover:text-slate-300 hover:border-slate-700'}`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          {demoMode ? 'Demo' : 'Live'}
        </button>
      </div>
    </header>
  );
}
