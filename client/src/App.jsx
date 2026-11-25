import React, { Component, useState } from 'react';
import { useVpsSocket } from './hooks/useVpsSocket';
import { HeaderControls } from './components/HeaderControls';
import { VitalsHud } from './components/VitalsHud';
import { GlobeVisualizer } from './components/GlobeVisualizer';
import { OrbitVisualizer } from './components/OrbitVisualizer';
import { SpeedGauges } from './components/SpeedGauges';
import { BandwidthChart } from './components/BandwidthChart';
import { ConnectionMatrix } from './components/ConnectionMatrix';

class DashboardErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = { hasError: false, message: '' };
  }
  static getDerivedStateFromError(error) {
    return { hasError: true, message: error?.message || 'Telemetry render error' };
  }
  render() {
    if (this.state.hasError) {
      return (
        <div className="cyber-panel p-6 rounded-2xl border border-rose-500/40 text-center font-mono-val text-xs text-slate-300">
          <div className="text-rose-400 font-bold mb-2">Panel Recovery Triggered</div>
          <div className="text-slate-500 mb-3">{this.state.message}</div>
          <button
            onClick={() => this.setState({ hasError: false, message: '' })}
            className="px-3 py-1.5 rounded-lg bg-cyan-500/20 border border-cyan-500/40 text-cyan-300 font-bold"
          >
            Resume Panel
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}

export default function App() {
  const { data, status, demoMode, toggleDemo } = useVpsSocket();
  const [viewMode, setViewMode] = useState('globe');
  const [streamerMode, setStreamerMode] = useState(false);

  const system = data?.system || {};
  const network = data?.network || {};
  const sockets = Array.isArray(data?.sockets) ? data.sockets : [];
  const vps = data?.vps || {
    ip: '127.0.0.1', city: 'Host Node', country: 'VPS', flag: '🌐',
    ll: [1.2897, 103.8501], org: 'Primary Network', hostname: 'linux-vps'
  };

  return (
    <div className="min-h-screen flex flex-col p-3 md:p-5 max-w-[1620px] mx-auto gap-3 relative">
      {/* Subtle tactical scanlines */}
      <div className="fixed inset-0 scanlines z-[9999] pointer-events-none opacity-[0.08]" />

      {/* Top Header */}
      <HeaderControls
        viewMode={viewMode} setViewMode={setViewMode}
        streamerMode={streamerMode} setStreamerMode={setStreamerMode}
        demoMode={demoMode} toggleDemo={toggleDemo}
        status={status} vps={vps} socketCount={sockets.length}
      />

      {/* System Vitals */}
      <DashboardErrorBoundary>
        <VitalsHud system={system} vps={vps} />
      </DashboardErrorBoundary>

      {/* Main 3D Globe + Gauges & Oscilloscope Row */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 items-stretch">
        <div className="lg:col-span-7 h-[500px] lg:h-[550px]">
          <DashboardErrorBoundary>
            {viewMode === 'globe'
              ? <GlobeVisualizer sockets={sockets} vps={vps} streamerMode={streamerMode} />
              : <OrbitVisualizer sockets={sockets} vps={vps} streamerMode={streamerMode} />
            }
          </DashboardErrorBoundary>
        </div>
        <div className="lg:col-span-5 flex flex-col gap-3 lg:h-[550px]">
          <DashboardErrorBoundary>
            <SpeedGauges network={network} />
            <BandwidthChart history={network.history || []} />
          </DashboardErrorBoundary>
        </div>
      </div>

      {/* Live Connection Matrix & Destination Summary */}
      <DashboardErrorBoundary>
        <ConnectionMatrix sockets={sockets} streamerMode={streamerMode} />
      </DashboardErrorBoundary>

      {/* Footer */}
      <footer className="mt-1 py-3 border-t border-slate-900/50 flex flex-col sm:flex-row items-center justify-between text-[10px] font-mono-val text-slate-600">
        <span>VPS PULSE // {vps?.hostname && vps.hostname !== 'localhost' ? vps.hostname.toUpperCase() : 'LINUX NODE'} // {vps?.city ? vps.city.toUpperCase() : 'HOST'}</span>
        <div className="flex items-center gap-3">
          <span>PORT {vps?.port || '7777'}</span>
          <span className="text-slate-800">│</span>
          <span>{vps?.platform ? vps.platform.toUpperCase() : 'LINUX'} TELEMETRY</span>
          <span className="text-slate-800">│</span>
          <span className="text-emerald-500 font-bold flex items-center gap-1.5">
            <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 inline-block led-pulse" style={{ color: '#10b981' }} />
            ALL SYSTEMS NOMINAL
          </span>
        </div>
      </footer>
    </div>
  );
}
