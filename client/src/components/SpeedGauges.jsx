import React, { useEffect, useRef } from 'react';
import { ArrowDownLeft, ArrowUpRight } from 'lucide-react';

// Speedtest-style non-linear logarithmic scale ticks (Mbps)
const TICKS = [
  { value: 0, label: '0' },
  { value: 1, label: '1' },
  { value: 5, label: '5' },
  { value: 10, label: '10' },
  { value: 25, label: '25' },
  { value: 50, label: '50' },
  { value: 100, label: '100' },
  { value: 250, label: '250' },
  { value: 500, label: '500' },
  { value: 1000, label: '1k' }
];

const BRACKETS = [
  { min: 0, max: 1, a1: -135, a2: -105 },
  { min: 1, max: 5, a1: -105, a2: -75 },
  { min: 5, max: 10, a1: -75, a2: -45 },
  { min: 10, max: 25, a1: -45, a2: -15 },
  { min: 25, max: 50, a1: -15, a2: 15 },
  { min: 50, max: 100, a1: 15, a2: 45 },
  { min: 100, max: 250, a1: 45, a2: 75 },
  { min: 250, max: 500, a1: 75, a2: 105 },
  { min: 500, max: 1000, a1: 105, a2: 135 }
];

function mbpsToAngle(mbps) {
  if (mbps <= 0) return -135;
  if (mbps >= 1000) return 135;
  for (const b of BRACKETS) {
    if (mbps >= b.min && mbps <= b.max) {
      const frac = (mbps - b.min) / (b.max - b.min);
      return b.a1 + frac * (b.a2 - b.a1);
    }
  }
  return 135;
}

function polarToCartesian(centerX, centerY, radius, angleInDegrees) {
  const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
  return {
    x: centerX + radius * Math.cos(angleInRadians),
    y: centerY + radius * Math.sin(angleInRadians)
  };
}

function describeArc(x, y, radius, startA, endA) {
  const start = polarToCartesian(x, y, radius, endA);
  const end = polarToCartesian(x, y, radius, startA);
  const largeArcFlag = endA - startA <= 180 ? '0' : '1';
  return ['M', start.x, start.y, 'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(' ');
}

function formatTotal(bytes) {
  if (!bytes) return '0.0 GB';
  const gb = bytes / (1024 * 1024 * 1024);
  if (gb >= 1000) return `${(gb / 1024).toFixed(2)} TB`;
  return `${gb.toFixed(1)} GB`;
}

// Precompute static major & minor dial geometry
const CX = 115;
const CY = 115;
const R = 82;
const START_ANGLE = -135;
const END_ANGLE = 135;
const TRACK_PATH = describeArc(CX, CY, R, START_ANGLE, END_ANGLE);
const OUTER_RING_PATH = describeArc(CX, CY, R + 12, START_ANGLE, END_ANGLE);

const MINOR_TICKS = [];
for (let deg = START_ANGLE; deg <= END_ANGLE; deg += 6) {
  // Skip angles right on top of major bracket lines (-135, -105, -75, ...)
  if ((deg - START_ANGLE) % 30 !== 0) {
    MINOR_TICKS.push({
      angle: deg,
      inner: polarToCartesian(CX, CY, R + 5.5, deg),
      outer: polarToCartesian(CX, CY, R + 9, deg)
    });
  }
}

function CockpitSpeedometer({ label, bytesPerSec, totalBytes, peakBps = 0, type }) {
  const isDown = type === 'download';
  const targetMbps = (Math.max(0, bytesPerSec) * 8) / 1000000;
  const externalPeakMbps = (Math.max(0, peakBps) * 8) / 1000000;

  const targetMbpsRef = useRef(0);
  const peakHoldMbpsRef = useRef(0);
  targetMbpsRef.current = targetMbps;
  if (externalPeakMbps > peakHoldMbpsRef.current) {
    peakHoldMbpsRef.current = externalPeakMbps;
  }

  // Direct SVG & text refs for 60 FPS zero-re-render needle physics
  const activeArcRef = useRef(null);
  const glowArcRef = useRef(null);
  const needleGroupRef = useRef(null);
  const peakMarkerRef = useRef(null);
  const valueTextRef = useRef(null);
  const unitTextRef = useRef(null);
  const peakTextRef = useRef(null);
  const ambientRef = useRef(null);
  const majorTickLinesRef = useRef([]);
  const majorTickLabelsRef = useRef([]);

  const accentColor = isDown ? '#00e5ff' : '#ec4899';
  const secondaryColor = isDown ? '#38bdf8' : '#a855f7';
  const gradId = isDown ? 'downCockpitGrad' : 'upCockpitGrad';
  const glowFilter = isDown
    ? 'drop-shadow(0 0 8px rgba(0,229,255,0.75))'
    : 'drop-shadow(0 0 8px rgba(236,72,153,0.75))';

  useEffect(() => {
    let curAngle = -135;
    let velAngle = 0;
    let curMbps = 0;
    let animId;
    let lastTime = performance.now();

    const step = (now) => {
      const dt = Math.min(0.05, (now - lastTime) / 1000);
      lastTime = now;

      const tMbps = targetMbpsRef.current;
      const tAngle = mbpsToAngle(tMbps);

      // Update decaying 60s visual peak hold
      if (tMbps > peakHoldMbpsRef.current) {
        peakHoldMbpsRef.current = tMbps;
      } else {
        peakHoldMbpsRef.current = Math.max(tMbps, peakHoldMbpsRef.current - dt * peakHoldMbpsRef.current * 0.025);
      }

      // Smooth spring-damper physics for crisp dial response
      const stiffness = 135;
      const damping = 18;
      const force = (tAngle - curAngle) * stiffness;
      velAngle = (velAngle + force * dt) * Math.exp(-damping * dt);
      curAngle = Math.max(-135, Math.min(135, curAngle + velAngle * dt));

      curMbps += (tMbps - curMbps) * Math.min(1, dt * 8);

      const safeEnd = Math.max(START_ANGLE + 0.15, curAngle);
      const arcD = describeArc(CX, CY, R, START_ANGLE, safeEnd);

      if (activeArcRef.current) activeArcRef.current.setAttribute('d', arcD);
      if (glowArcRef.current) glowArcRef.current.setAttribute('d', arcD);
      if (needleGroupRef.current) needleGroupRef.current.setAttribute('transform', `rotate(${curAngle}, ${CX}, ${CY})`);

      const peakAngle = mbpsToAngle(peakHoldMbpsRef.current);
      if (peakMarkerRef.current) {
        peakMarkerRef.current.setAttribute('transform', `rotate(${peakAngle}, ${CX}, ${CY})`);
        peakMarkerRef.current.style.opacity = peakHoldMbpsRef.current > 0.2 ? '0.95' : '0';
      }

      // Format Mbps or auto Gbps above 1000
      if (valueTextRef.current && unitTextRef.current) {
        if (curMbps >= 1000) {
          valueTextRef.current.textContent = (curMbps / 1000).toFixed(2);
          unitTextRef.current.textContent = 'Gbps';
        } else {
          valueTextRef.current.textContent = Math.max(0, curMbps).toFixed(1);
          unitTextRef.current.textContent = 'Mbps';
        }
      }

      if (peakTextRef.current) {
        const pk = peakHoldMbpsRef.current;
        peakTextRef.current.textContent = pk >= 1000 ? `${(pk / 1000).toFixed(2)} Gbps` : `${pk.toFixed(1)} Mbps`;
      }

      if (ambientRef.current) {
        const ratio = Math.min(1, (curAngle + 135) / 270);
        ambientRef.current.style.opacity = (0.08 + ratio * 0.34).toFixed(2);
      }

      // Highlight passed major ticks directly without React re-render
      for (let i = 0; i < TICKS.length; i++) {
        const tAngleTick = mbpsToAngle(TICKS[i].value);
        const passed = curAngle >= tAngleTick - 1.5;
        const lineEl = majorTickLinesRef.current[i];
        const textEl = majorTickLabelsRef.current[i];
        if (lineEl) lineEl.setAttribute('stroke', passed ? accentColor : 'rgba(255,255,255,0.2)');
        if (textEl) textEl.setAttribute('fill', passed ? '#f8fafc' : '#64748b');
      }

      animId = requestAnimationFrame(step);
    };

    animId = requestAnimationFrame(step);
    return () => cancelAnimationFrame(animId);
  }, [accentColor]);

  return (
    <div className="cyber-panel p-4 rounded-2xl flex flex-col items-center justify-between relative overflow-hidden">
      {/* Subtle radial gauge energy aura */}
      <div
        ref={ambientRef}
        className="absolute inset-0 pointer-events-none transition-opacity duration-300"
        style={{
          opacity: 0.1,
          background: `radial-gradient(circle at 50% 56%, ${isDown ? 'rgba(0, 229, 255, 0.25)' : 'rgba(236, 72, 153, 0.25)'} 0%, transparent 66%)`
        }}
      />

      {/* Top Header */}
      <div className="w-full flex items-center justify-between border-b border-slate-800/60 pb-2 relative z-10">
        <div className="flex items-center gap-2">
          <div className={`w-6 h-6 rounded-lg flex items-center justify-center border ${
            isDown ? 'bg-cyan-500/10 border-cyan-500/30 text-cyan-400' : 'bg-pink-500/10 border-pink-500/30 text-pink-400'
          }`}>
            {isDown ? <ArrowDownLeft className="w-3.5 h-3.5" /> : <ArrowUpRight className="w-3.5 h-3.5" />}
          </div>
          <span className="text-[11px] font-display font-bold uppercase tracking-widest text-slate-200">
            {label}
          </span>
        </div>
        <span className={`text-[9px] font-mono-val px-2 py-0.5 rounded-full border font-bold tracking-wider ${
          isDown
            ? 'bg-cyan-950/60 border-cyan-700/40 text-cyan-300'
            : 'bg-pink-950/60 border-pink-700/40 text-pink-300'
        }`}>
          {isDown ? 'RX LIVE' : 'TX LIVE'}
        </span>
      </div>

      {/* Cockpit Speedometer SVG */}
      <div className="relative w-56 h-[184px] my-0.5 flex items-center justify-center z-10">
        <svg viewBox="0 0 230 220" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id={gradId} x1="0%" y1="100%" x2="100%" y2="0%">
              <stop offset="0%" stopColor={secondaryColor} />
              <stop offset="60%" stopColor={accentColor} />
              <stop offset="100%" stopColor="#ffffff" />
            </linearGradient>
            <radialGradient id="cockpitHub" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="70%" stopColor="#0f172a" />
              <stop offset="100%" stopColor="#020617" />
            </radialGradient>
          </defs>

          {/* Outer Bezel Hairline */}
          <path
            d={OUTER_RING_PATH}
            fill="none"
            stroke="rgba(148, 163, 184, 0.14)"
            strokeWidth="1"
          />

          {/* Minor Sub-Ticks */}
          {MINOR_TICKS.map((mt, idx) => (
            <line
              key={idx}
              x1={mt.inner.x}
              y1={mt.inner.y}
              x2={mt.outer.x}
              y2={mt.outer.y}
              stroke="rgba(148, 163, 184, 0.16)"
              strokeWidth="1"
            />
          ))}

          {/* Background Track */}
          <path
            d={TRACK_PATH}
            fill="none"
            stroke="#0e172a"
            strokeWidth="11"
            strokeLinecap="round"
          />

          {/* Wide Bloom Trail Underlay */}
          <path
            ref={glowArcRef}
            d={describeArc(CX, CY, R, START_ANGLE, START_ANGLE + 0.15)}
            fill="none"
            stroke={accentColor}
            strokeWidth="16"
            strokeLinecap="round"
            opacity="0.18"
          />

          {/* Active Crisp Gradient Arc */}
          <path
            ref={activeArcRef}
            d={describeArc(CX, CY, R, START_ANGLE, START_ANGLE + 0.15)}
            fill="none"
            stroke={`url(#${gradId})`}
            strokeWidth="10"
            strokeLinecap="round"
            style={{ filter: glowFilter }}
          />

          {/* Major Scale Ticks & Labels */}
          {TICKS.map((t, idx) => {
            const angle = mbpsToAngle(t.value);
            const inner = polarToCartesian(CX, CY, R + 3.5, angle);
            const outer = polarToCartesian(CX, CY, R + 12.5, angle);
            const textPos = polarToCartesian(CX, CY, R + 24, angle);

            return (
              <g key={t.label}>
                <line
                  ref={el => { majorTickLinesRef.current[idx] = el; }}
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke="rgba(255,255,255,0.2)"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                />
                <text
                  ref={el => { majorTickLabelsRef.current[idx] = el; }}
                  x={textPos.x}
                  y={textPos.y}
                  fill="#64748b"
                  fontSize="8.5"
                  fontFamily="'JetBrains Mono', monospace"
                  fontWeight="700"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {t.label}
                </text>
              </g>
            );
          })}

          {/* Decaying Peak Hold Diamond Marker */}
          <g ref={peakMarkerRef} transform={`rotate(${START_ANGLE}, ${CX}, ${CY})`} style={{ opacity: 0 }}>
            <polygon
              points={`${CX},${CY - R - 2} ${CX - 3.5},${CY - R - 9} ${CX + 3.5},${CY - R - 9}`}
              fill="#f59e0b"
              style={{ filter: 'drop-shadow(0 0 6px rgba(245,158,11,0.9))' }}
            />
          </g>

          {/* Animated Needle */}
          <g ref={needleGroupRef} transform={`rotate(${START_ANGLE}, ${CX}, ${CY})`}>
            <polygon
              points={`${CX - 3},${CY + 6} ${CX},${CY - R + 6} ${CX + 3},${CY + 6}`}
              fill={accentColor}
              style={{ filter: glowFilter }}
            />
            <line
              x1={CX}
              y1={CY + 2}
              x2={CX}
              y2={CY - R + 5}
              stroke="#ffffff"
              strokeWidth="1.2"
              strokeLinecap="round"
            />
          </g>

          {/* Center Pivot Hub */}
          <circle cx={CX} cy={CY} r="13" fill="url(#cockpitHub)" stroke="#1e293b" strokeWidth="2" />
          <circle cx={CX} cy={CY} r="4.5" fill={accentColor} style={{ filter: glowFilter }} />
        </svg>

        {/* Center Digital Speed Readout */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-16 pointer-events-none">
          <span
            ref={valueTextRef}
            className={`text-[34px] leading-none font-mono-val font-black tracking-tight ${
              isDown ? 'text-[#00e5ff] glow-cyan' : 'text-[#f472b6]'
            }`}
            style={!isDown ? { textShadow: '0 0 8px rgba(236,72,153,0.75), 0 0 20px rgba(236,72,153,0.35)' } : undefined}
          >
            0.0
          </span>
          <span
            ref={unitTextRef}
            className="text-[10px] font-display font-bold tracking-[0.22em] text-slate-400 uppercase mt-1"
          >
            Mbps
          </span>
        </div>
      </div>

      {/* Rich Footer Telemetry Bar: Peak + Session Volume */}
      <div className="w-full bg-slate-950/75 border border-slate-800/70 rounded-xl px-3 py-2 flex items-center justify-between text-[10px] font-mono-val relative z-10">
        <div className="flex items-center gap-1.5">
          <span className="w-1.5 h-1.5 rounded-full bg-amber-400" />
          <span className="text-slate-500">PEAK:</span>
          <span ref={peakTextRef} className="text-amber-300 font-bold">0.0 Mbps</span>
        </div>
        <div className="flex items-center gap-1.5">
          <span className="text-slate-500">VOL:</span>
          <span className="text-slate-200 font-bold">{formatTotal(totalBytes)}</span>
        </div>
      </div>
    </div>
  );
}

export function SpeedGauges({ network = {} }) {
  const rxSec = network.rxSec || 0;
  const txSec = network.txSec || 0;
  const rxTotal = network.rxTotal || 0;
  const txTotal = network.txTotal || 0;
  const history = network.history || [];

  const peakRx = history.length > 0 ? Math.max(...history.map(h => h.rx || 0)) : rxSec;
  const peakTx = history.length > 0 ? Math.max(...history.map(h => h.tx || 0)) : txSec;

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
      <CockpitSpeedometer
        label="Download"
        bytesPerSec={rxSec}
        totalBytes={rxTotal}
        peakBps={peakRx}
        type="download"
      />
      <CockpitSpeedometer
        label="Upload"
        bytesPerSec={txSec}
        totalBytes={txTotal}
        peakBps={peakTx}
        type="upload"
      />
    </div>
  );
}
