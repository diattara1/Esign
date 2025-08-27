import React from 'react';

const Sparkline = ({ data = [], width = 100, height = 30, stroke = '#3b82f6' }) => {
  const max = Math.max(...data, 1);
  const step = data.length > 1 ? width / (data.length - 1) : width;
  const points = data
    .map((d, i) => `${i * step},${height - (d / max) * height}`)
    .join(' ');
  return (
    <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-full">
      <polyline
        fill="none"
        stroke={stroke}
        strokeWidth="2"
        points={points}
      />
    </svg>
  );
};

export default Sparkline;
