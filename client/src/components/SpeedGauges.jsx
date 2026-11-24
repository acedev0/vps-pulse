import React, { useEffect, useRef, useState } from 'react';
import { ArrowDownLeft, ArrowUpRight, Gauge, Zap } from 'lucide-react';

// Ookla scale tick definitions
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

// Map Mbps value to angle between -135° and +135° (non-linear Ookla scale)
function mbpsToAngle(mbps) {
  if (mbps <= 0) return -135;
  if (mbps >= 1000) return 135;

  const brackets = [
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

  for (const b of brackets) {
    if (mbps >= b.min && mbps <= b.max) {
      const frac = (mbps - b.min) / (b.max - b.min);
      return b.a1 + frac * (b.a2 - b.a1);
    }
  }
  return 135;
}

function OoklaSpeedometer({ label, bytesPerSec, totalBytes, type }) {
  const isDown = type === 'download';
  const targetMbps = (Math.max(0, bytesPerSec) * 8) / 1000000;

  // Smoothed needle and display values using 60fps lerp
  const [displayMbps, setDisplayMbps] = useState(0);
  const [needleAngle, setNeedleAngle] = useState(-135);

  const currentMbpsRef = useRef(0);
  const currentAngleRef = useRef(-135);
  const targetAngleRef = useRef(-135);

  targetAngleRef.current = mbpsToAngle(targetMbps);

  useEffect(() => {
    let animId;
    const updateLoop = () => {
      // Lerp needle angle towards target
      const diffAngle = targetAngleRef.current - currentAngleRef.current;
      currentAngleRef.current += diffAngle * 0.08;

      // Lerp digital readout towards target
      const diffMbps = targetMbps - currentMbpsRef.current;
      currentMbpsRef.current += diffMbps * 0.08;

      setNeedleAngle(currentAngleRef.current);
      setDisplayMbps(Math.max(0, currentMbpsRef.current));

      animId = requestAnimationFrame(updateLoop);
    };

    animId = requestAnimationFrame(updateLoop);
    return () => cancelAnimationFrame(animId);
  }, [targetMbps]);

  const formatTotal = (bytes) => {
    if (!bytes) return '0 GB';
    const gb = bytes / (1024 * 1024 * 1024);
    if (gb >= 1000) return `${(gb / 1024).toFixed(2)} TB`;
    return `${gb.toFixed(1)} GB`;
  };

  const accentColor = isDown ? '#00e5ff' : '#d946ef';
  const glowShadow = isDown ? 'drop-shadow(0 0 10px rgba(0,229,255,0.7))' : 'drop-shadow(0 0 10px rgba(217,70,239,0.7))';
  const textClass = isDown ? 'text-[#00e5ff] glow-cyan' : 'text-[#d946ef] glow-pink';

  // Arc calculations
  const cx = 110, cy = 110, r = 82;
  const startAngle = -135;
  const endAngle = 135;
  const sweepAngle = endAngle - startAngle; // 270 deg

  const polarToCartesian = (centerX, centerY, radius, angleInDegrees) => {
    const angleInRadians = ((angleInDegrees - 90) * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians)
    };
  };

  const describeArc = (x, y, radius, startA, endA) => {
    const start = polarToCartesian(x, y, radius, endA);
    const end = polarToCartesian(x, y, radius, startA);
    const largeArcFlag = endA - startA <= 180 ? '0' : '1';
    return ['M', start.x, start.y, 'A', radius, radius, 0, largeArcFlag, 0, end.x, end.y].join(' ');
  };

  const trackPath = describeArc(cx, cy, r, startAngle, endAngle);
  const activePath = describeArc(cx, cy, r, startAngle, Math.max(startAngle + 0.1, needleAngle));

  return (
    <div className="cyber-panel p-4 rounded-2xl flex flex-col items-center justify-between relative overflow-hidden border border-slate-800/80">
      {/* Top Header */}
      <div className="w-full flex items-center justify-between border-b border-slate-800/60 pb-2">
        <div className="flex items-center gap-2">
          {isDown ? (
            <ArrowDownLeft className="w-4 h-4 text-[#00e5ff]" />
          ) : (
            <ArrowUpRight className="w-4 h-4 text-[#d946ef]" />
          )}
          <span className="text-[11px] font-display font-bold uppercase tracking-widest text-slate-300">
            {label}
          </span>
        </div>
        <span className="text-[10px] font-mono-val px-2 py-0.5 rounded-full bg-slate-900 border border-slate-800 text-slate-400">
          OOKLA GAUGE
        </span>
      </div>

      {/* Speedometer SVG Canvas */}
      <div className="relative w-56 h-48 my-1 flex items-center justify-center">
        <svg viewBox="0 0 220 220" className="w-full h-full overflow-visible">
          <defs>
            <linearGradient id={isDown ? 'downGrad' : 'upGrad'} x1="0" y1="0" x2="1" y2="1">
              <stop offset="0%" stopColor={isDown ? '#00f3ff' : '#a855f7'} />
              <stop offset="100%" stopColor={isDown ? '#00e5ff' : '#ec4899'} />
            </linearGradient>
            <radialGradient id="needleHubGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stopColor="#334155" />
              <stop offset="100%" stopColor="#0f172a" />
            </radialGradient>
          </defs>

          {/* Background Outer Arc */}
          <path
            d={trackPath}
            fill="none"
            stroke="#131d31"
            strokeWidth="10"
            strokeLinecap="round"
          />

          {/* Active Highlight Arc */}
          <path
            d={activePath}
            fill="none"
            stroke={`url(#${isDown ? 'downGrad' : 'upGrad'})`}
            strokeWidth="10"
            strokeLinecap="round"
            style={{ filter: glowShadow }}
          />

          {/* Scale Ticks and Labels */}
          {TICKS.map((t, idx) => {
            const angle = mbpsToAngle(t.value);
            const outer = polarToCartesian(cx, cy, r + 10, angle);
            const inner = polarToCartesian(cx, cy, r + 4, angle);
            const textPos = polarToCartesian(cx, cy, r + 22, angle);

            const isPassed = needleAngle >= angle;

            return (
              <g key={idx}>
                <line
                  x1={inner.x}
                  y1={inner.y}
                  x2={outer.x}
                  y2={outer.y}
                  stroke={isPassed ? accentColor : 'rgba(255,255,255,0.18)'}
                  strokeWidth="2"
                  strokeLinecap="round"
                />
                <text
                  x={textPos.x}
                  y={textPos.y}
                  fill={isPassed ? '#f8fafc' : '#64748b'}
                  fontSize="8"
                  fontFamily="'JetBrains Mono', monospace"
                  fontWeight="bold"
                  textAnchor="middle"
                  dominantBaseline="central"
                >
                  {t.label}
                </text>
              </g>
            );
          })}

          {/* Animated Needle */}
          <g transform={`rotate(${needleAngle}, ${cx}, ${cy})`}>
            {/* Tapered needle pointer */}
            <polygon
              points={`${cx - 2.5},${cy} ${cx},${cy - r + 8} ${cx + 2.5},${cy}`}
              fill={accentColor}
              style={{ filter: glowShadow }}
            />
            {/* Needle center line */}
            <line
              x1={cx}
              y1={cy}
              x2={cx}
              y2={cy - r + 6}
              stroke="#ffffff"
              strokeWidth="1"
            />
          </g>

          {/* Center Hub */}
          <circle cx={cx} cy={cy} r="14" fill="url(#needleHubGrad)" stroke="#1e293b" strokeWidth="2" />
          <circle cx={cx} cy={cy} r="4" fill={accentColor} style={{ filter: glowShadow }} />
        </svg>

        {/* Center Digital Readout in Mbps */}
        <div className="absolute inset-0 flex flex-col items-center justify-center pt-14 pointer-events-none">
          <div className="flex items-baseline gap-1">
            <span className={`text-4xl font-mono-val font-black tracking-tight ${textClass}`}>
              {displayMbps.toFixed(1)}
            </span>
          </div>
          <span className="text-[11px] font-display font-black tracking-[0.2em] text-slate-400">
            Mbps
          </span>
        </div>
      </div>

      {/* Footer Total */}
      <div className="w-full bg-slate-950/70 border border-slate-800/80 rounded-xl px-3.5 py-2 flex items-center justify-between text-xs font-mono-val">
        <span className="text-slate-400">Session Volume:</span>
        <span className="text-slate-200 font-bold">{formatTotal(totalBytes)}</span>
      </div>
    </div>
  );
}

export function SpeedGauges({ network = {} }) {
  const rxSec = network.rxSec || 0;
  const txSec = network.txSec || 0;
  const rxTotal = network.rxTotal || 0;
  const txTotal = network.txTotal || 0;

  return (
    <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
      <OoklaSpeedometer
        label="Download Speed"
        bytesPerSec={rxSec}
        totalBytes={rxTotal}
        type="download"
      />
      <OoklaSpeedometer
        label="Upload Speed"
        bytesPerSec={txSec}
        totalBytes={txTotal}
        type="upload"
      />
    </div>
  );
}
