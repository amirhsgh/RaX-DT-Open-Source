import React from 'react';

const DNAIcon = ({ size = 'w-8 h-8', className = '', animated = false }) => {
  return (
    <svg
      className={`${size} ${className} ${animated ? 'animate-pulse' : ''}`}
      viewBox="0 0 100 100"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      {/* DNA Double Helix */}
      <path
        d="M30 10 Q20 30 30 50 Q40 70 30 90"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
      />
      <path
        d="M70 10 Q80 30 70 50 Q60 70 70 90"
        stroke="currentColor"
        strokeWidth="3"
        fill="none"
      />

      {/* Base pairs */}
      {[0, 1, 2, 3, 4, 5, 6, 7].map((i) => (
        <g key={i}>
          <line
            x1={30 + Math.sin(i * 0.8) * 10}
            y1={15 + i * 10}
            x2={70 - Math.sin(i * 0.8) * 10}
            y2={15 + i * 10}
            stroke="currentColor"
            strokeWidth="2"
            opacity="0.7"
          />
          <circle
            cx={30 + Math.sin(i * 0.8) * 10}
            cy={15 + i * 10}
            r="2"
            fill="currentColor"
          />
          <circle
            cx={70 - Math.sin(i * 0.8) * 10}
            cy={15 + i * 10}
            r="2"
            fill="currentColor"
          />
        </g>
      ))}
    </svg>
  );
};

export default DNAIcon;