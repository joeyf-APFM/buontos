import { useState } from 'react';

interface ComplianceTrendMiniProps {
  data?: number[];
  className?: string;
}

export default function ComplianceTrendMini({
  data,
  className = ''
}: ComplianceTrendMiniProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number | null>(null);

  // Don't render if no data is provided
  if (!data || data.length === 0) {
    return null;
  }

  const chartData = data;

  const width = 280;
  const height = 110;
  const padding = { top: 5, right: 10, bottom: 15, left: 28 };
  const chartWidth = width - padding.left - padding.right;
  const chartHeight = height - padding.top - padding.bottom;

  // Calculate min/max for better scaling - ensure minimum range
  const dataMin = Math.min(...chartData);
  const dataMax = Math.max(...chartData);
  const minValue = Math.max(0, Math.floor(dataMin / 10) * 10 - 10); // Add padding below, but not below 0
  const maxValue = Math.min(100, Math.ceil(dataMax / 10) * 10 + 10); // Add padding above, but not above 100
  const range = Math.max(maxValue - minValue, 20); // Ensure minimum range of 20 for visibility

  // Calculate SVG path for the line chart
  const points = chartData.map((value, index) => {
    const x = padding.left + (index / (chartData.length - 1)) * chartWidth;
    const y = padding.top + chartHeight - ((value - minValue) / range) * chartHeight;
    return { x, y, value, index };
  });

  const pathD = `M ${points.map(p => `${p.x},${p.y}`).join(' L ')}`;

  // Create area fill path
  const areaD = `${pathD} L ${width - padding.right},${height - padding.bottom} L ${padding.left},${height - padding.bottom} Z`;

  // Calculate day label for hover
  const getDayLabel = (index: number) => {
    const daysAgo = chartData.length - 1 - index;
    if (daysAgo === 0) return 'Today';
    if (daysAgo === 1) return 'Yesterday';
    return `${daysAgo} days ago`;
  };

  return (
    <div className={`relative ${className}`}>
      <svg
        width="100%"
        height={height}
        viewBox={`0 0 ${width} ${height}`}
        preserveAspectRatio="xMidYMid meet"
        className="overflow-visible"
      >
        {/* Area fill with gradient */}
        <defs>
          <linearGradient id="areaGradient" x1="0%" y1="0%" x2="0%" y2="100%">
            <stop offset="0%" stopColor="hsl(var(--primary))" stopOpacity="0.2" />
            <stop offset="100%" stopColor="hsl(var(--primary))" stopOpacity="0.05" />
          </linearGradient>
        </defs>

        <path
          d={areaD}
          fill="url(#areaGradient)"
        />

        {/* Line */}
        <path
          d={pathD}
          fill="none"
          stroke="hsl(var(--primary))"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {/* Interactive hover points */}
        {points.map((point) => (
          <g key={point.index}>
            {/* Invisible larger hit area for better hover */}
            <circle
              cx={point.x}
              cy={point.y}
              r="8"
              fill="transparent"
              className="cursor-pointer"
              onMouseEnter={() => setHoveredIndex(point.index)}
              onMouseLeave={() => setHoveredIndex(null)}
            />
            {/* Visible dot */}
            <circle
              cx={point.x}
              cy={point.y}
              r={hoveredIndex === point.index ? "4" : "2"}
              fill="hsl(var(--primary))"
              className={`transition-all ${hoveredIndex === point.index ? 'opacity-100' : 'opacity-50'}`}
              pointerEvents="none"
            />
          </g>
        ))}

        {/* X-axis labels */}
        <text
          x={padding.left}
          y={height - 3}
          textAnchor="start"
          className="text-[11px] fill-muted-foreground"
        >
          30d ago
        </text>
        <text
          x={width - padding.right}
          y={height - 3}
          textAnchor="end"
          className="text-[11px] fill-muted-foreground"
        >
          Today
        </text>

        {/* Y-axis labels */}
        <text
          x={3}
          y={padding.top + 3}
          textAnchor="start"
          className="text-[11px] fill-muted-foreground"
        >
          100%
        </text>
        <text
          x={3}
          y={height - padding.bottom - 2}
          textAnchor="start"
          className="text-[11px] fill-muted-foreground"
        >
          0%
        </text>
      </svg>

      {/* Hover tooltip */}
      {hoveredIndex !== null && (
        <div
          className="absolute bottom-full left-1/2 transform -translate-x-1/2 mb-2 px-2 py-1 bg-popover text-popover-foreground text-xs rounded shadow-lg border whitespace-nowrap z-10"
          style={{
            pointerEvents: 'none',
          }}
        >
          <div className="font-semibold">{chartData[hoveredIndex]}% compliance</div>
          <div className="text-muted-foreground">{getDayLabel(hoveredIndex)}</div>
        </div>
      )}
    </div>
  );
}
