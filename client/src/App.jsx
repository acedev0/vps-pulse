import React, { useState } from 'react';
import { useVpsSocket } from './hooks/useVpsSocket';
import { HeaderControls } from './components/HeaderControls';
import { VitalsHud } from './components/VitalsHud';
import { GlobeVisualizer } from './components/GlobeVisualizer';
import { OrbitVisualizer } from './components/OrbitVisualizer';
import { SpeedGauges } from './components/SpeedGauges';
import { BandwidthChart } from './components/BandwidthChart';
import { ConnectionMatrix } from './components/ConnectionMatrix';

export default function App() {
  const { data, status, demoMode, toggleDemo } = useVpsSocket();
  const [viewMode, setViewMode] = useState('globe');
  const [streamerMode, setStreamerMode] = useState(false);

  const system = data?.system || {};
  const network = data?.network || {};
  const sockets = data?.sockets || [];
  const vps = data?.vps || {
    ip: '127.0.0.1', city: 'Host Node', country: 'VPS', flag: '🌐',
    ll: [1.2897, 103.8501], org: 'Primary Network', hostname: 'linux-vps'
  };

  return (
    <div className="min-h-screen flex flex-col p-3 md:p-5 max-w-[1600px] mx-auto gap-3 relative">
      {/* CRT Scanline overlay */}
      <div className="fixed inset-0 scanlines z-[9999] pointer-events-none opacity-30" />

      {/* Top Header */}
      <HeaderControls
        viewMode={viewMode} setViewMode={setViewMode}
        streamerMode={streamerMode} setStreamerMode={setStreamerMode}
        demoMode={demoMode} toggleDemo={toggleDemo}
        status={status} vps={vps}
      />

      {/* System Vitals */}
      <VitalsHud system={system} vps={vps} />

      {/* Main viz + speed column */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3">
        <div className="lg:col-span-7 h-[520px]">
          {viewMode === 'globe'
            ? <GlobeVisualizer sockets={sockets} vps={vps} streamerMode={streamerMode} />
            : <OrbitVisualizer sockets={sockets} vps={vps} streamerMode={streamerMode} />
          }
        </div>
        <div className="lg:col-span-5 flex flex-col gap-3">
          <SpeedGauges network={network} />
          <BandwidthChart history={network.history || []} />
        </div>
      </div>

      {/* Connection Matrix */}
      <ConnectionMatrix sockets={sockets} streamerMode={streamerMode} />

      {/* Footer */}
      <footer className="mt-1 py-3 border-t border-slate-900/40 flex flex-col sm:flex-row items-center justify-between text-[10px] font-mono-val text-slate-700">
        <span>VPS PULSE // {vps?.hostname ? vps.hostname.toUpperCase() : 'LINUX NODE'} // {vps?.city ? vps.city.toUpperCase() : 'HOST'}</span>
        <div className="flex items-center gap-3">
          <span>PORT {vps?.port || '7777'}</span>
          <span className="text-slate-800">│</span>
          <span>{vps?.platform ? vps.platform.toUpperCase() : 'LINUX'} TELEMETRY</span>
          <span className="text-slate-800">│</span>
          <span className="text-emerald-600 font-bold flex items-center gap-1">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block led-pulse" style={{color: '#10b981'}} />
            ALL SYSTEMS NOMINAL
          </span>
        </div>
      </footer>
    </div>
  );
}
