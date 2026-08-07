import { useEffect, useRef, useState } from 'react';

/**
 * AnimatedCounter — smooth count-up animation for numeric values.
 */
export function AnimatedCounter({ value, duration = 800, suffix = '', prefix = '', decimals = 0 }: {
  value: number;
  duration?: number;
  suffix?: string;
  prefix?: string;
  decimals?: number;
}) {
  const [display, setDisplay] = useState(0);
  const prevRef = useRef(0);

  useEffect(() => {
    const start = prevRef.current;
    const diff = value - start;
    if (diff === 0) return;

    const startTime = performance.now();
    const step = (now: number) => {
      const elapsed = now - startTime;
      const progress = Math.min(elapsed / duration, 1);
      // Ease-out cubic
      const eased = 1 - Math.pow(1 - progress, 3);
      const current = start + diff * eased;
      setDisplay(current);
      if (progress < 1) requestAnimationFrame(step);
      else prevRef.current = value;
    };
    requestAnimationFrame(step);
  }, [value, duration]);

  return (
    <span className="number-transition tabular-nums">
      {prefix}{decimals > 0 ? display.toFixed(decimals) : Math.round(display)}{suffix}
    </span>
  );
}

/**
 * AnimatedBar — a single bar with grow animation and interactive hover.
 */
export function AnimatedBar({ height, maxHeight = 100, color, delay = 0, tooltip, label, onClick }: {
  height: number;
  maxHeight?: number;
  color: string;
  delay?: number;
  tooltip?: string;
  label?: string;
  onClick?: () => void;
}) {
  const [isVisible, setIsVisible] = useState(false);
  const [hovered, setHovered] = useState(false);
  const barRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const timer = setTimeout(() => setIsVisible(true), delay);
    return () => clearTimeout(timer);
  }, [delay]);

  const pct = maxHeight > 0 ? (height / maxHeight) * 100 : 0;

  return (
    <div
      className="flex-1 flex flex-col items-center group relative cursor-default"
      onMouseEnter={() => setHovered(true)}
      onMouseLeave={() => setHovered(false)}
      onClick={onClick}
    >
      <div className="w-full flex flex-col justify-end h-full">
        <div
          ref={barRef}
          className={`w-full rounded-t-md bar-transition ${hovered ? 'opacity-100 scale-x-110' : 'opacity-90'}`}
          style={{
            height: isVisible ? `${Math.max(pct, 2)}%` : '0%',
            backgroundColor: color,
            transition: `height 0.6s cubic-bezier(0.4, 0, 0.2, 1) ${delay}ms, transform 0.15s ease, opacity 0.15s ease`,
          }}
        />
      </div>
      {label && <span className="text-[9px] text-gray-400 mt-1 truncate w-full text-center">{label}</span>}

      {/* Tooltip */}
      {hovered && tooltip && (
        <div className="absolute -top-12 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-[10px] px-2.5 py-1.5 rounded-lg tooltip-pop whitespace-nowrap pointer-events-none z-20 shadow-xl border border-gray-700">
          {tooltip}
          <div className="absolute top-full left-1/2 -translate-x-1/2 -mt-px">
            <div className="w-2 h-2 bg-gray-900 rotate-45 border-r border-b border-gray-700" />
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * AnimatedProgressBar — horizontal progress bar with smooth fill animation.
 */
export function AnimatedProgressBar({ value, max = 100, color, height = 'h-6', delay = 0, label, showPct = true }: {
  value: number;
  max?: number;
  color: string;
  height?: string;
  delay?: number;
  label?: string;
  showPct?: boolean;
}) {
  const [filled, setFilled] = useState(false);
  const pct = max > 0 ? Math.min((value / max) * 100, 100) : 0;

  useEffect(() => {
    const timer = setTimeout(() => setFilled(true), delay + 100);
    return () => clearTimeout(timer);
  }, [delay]);

  return (
    <div className="w-full">
      {label && <div className="flex justify-between mb-1">
        <span className="text-xs font-medium text-gray-600">{label}</span>
        {showPct && <span className="text-xs font-bold text-gray-700">{pct.toFixed(0)}%</span>}
      </div>}
      <div className={`w-full ${height} bg-gray-100 rounded-full overflow-hidden`}>
        <div
          className="h-full rounded-full transition-all duration-700 ease-out"
          style={{
            width: filled ? `${Math.max(pct, 1)}%` : '0%',
            backgroundColor: color,
            transitionDelay: `${delay}ms`,
          }}
        />
      </div>
    </div>
  );
}

/**
 * MetricCard — animated metric card with entrance animation.
 */
export function MetricCard({ icon: Icon, label, value, format, color, bg, delay = 0 }: {
  icon: React.ComponentType<{ size: number; className?: string }>;
  label: string;
  value: number;
  format: (v: number) => string;
  color: string;
  bg: string;
  delay?: number;
}) {
  return (
    <div
      className="card p-6 shadow-sm hover-lift ring-highlight card-enter"
      style={{ animationDelay: `${delay}ms` }}
    >
      <div className="flex items-center justify-between mb-3">
        <span className="text-sm font-medium text-gray-500">{label}</span>
        <div className={`w-9 h-9 ${bg} rounded-xl flex items-center justify-center`}>
          <Icon size={18} className={color} />
        </div>
      </div>
      <div className={`text-3xl font-black ${color}`}>
        {format(value)}
      </div>
    </div>
  );
}
