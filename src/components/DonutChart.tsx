import React from 'react';

interface DonutChartProps {
  online: number;
  offline: number;
  checking: number;
}

/**
 * Small donut chart summarizing a collapsed node's hidden-children status.
 * Uses its own palette to preserve the original on-canvas appearance.
 */
export const DonutChart: React.FC<DonutChartProps> = ({ online, offline, checking }) => {
  const total = online + offline + checking;
  const onlineAngle = total > 0 ? (online / total) * 360 : 0;
  const offlineAngle = total > 0 ? (offline / total) * 360 : 0;

  const arc = (startAngle: number, endAngle: number, color: string): React.ReactNode => {
    if (endAngle - startAngle === 0) return null;
    const outerR = 7;
    const innerR = 4;
    if (endAngle - startAngle >= 360) {
      return (
        <>
          <circle cx="8" cy="8" r={outerR} fill={color} />
          <circle cx="8" cy="8" r={innerR} fill="white" />
        </>
      );
    }
    const startRad = ((startAngle - 90) * Math.PI) / 180;
    const endRad = ((endAngle - 90) * Math.PI) / 180;
    const outerX1 = 8 + outerR * Math.cos(startRad);
    const outerY1 = 8 + outerR * Math.sin(startRad);
    const outerX2 = 8 + outerR * Math.cos(endRad);
    const outerY2 = 8 + outerR * Math.sin(endRad);
    const innerX1 = 8 + innerR * Math.cos(startRad);
    const innerY1 = 8 + innerR * Math.sin(startRad);
    const innerX2 = 8 + innerR * Math.cos(endRad);
    const innerY2 = 8 + innerR * Math.sin(endRad);
    const largeArc = endAngle - startAngle > 180 ? 1 : 0;
    return (
      <path
        d={`M ${outerX1} ${outerY1} A ${outerR} ${outerR} 0 ${largeArc} 1 ${outerX2} ${outerY2} L ${innerX2} ${innerY2} A ${innerR} ${innerR} 0 ${largeArc} 0 ${innerX1} ${innerY1} Z`}
        fill={color}
      />
    );
  };

  return (
    <div className="relative w-8 h-8 flex-shrink-0">
      <svg width="100%" height="100%" viewBox="0 0 16 16" className="transform -rotate-90">
        <circle cx="8" cy="8" r="7" fill="#e5e7eb" />
        <circle cx="8" cy="8" r="4" fill="white" />
        {arc(0, onlineAngle, '#22c55e')}
        {arc(onlineAngle, onlineAngle + offlineAngle, '#ef4444')}
        {checking > 0 && arc(onlineAngle + offlineAngle, 360, '#9ca3af')}
      </svg>
    </div>
  );
};

export default DonutChart;
