import React from 'react';

const SkeletonLoader: React.FC<{ height?: string | number, width?: string | number, style?: React.CSSProperties, count?: number }> = ({ height = '100%', width = '100%', style = {}, count = 1 }) => {
  const defaultStyle: React.CSSProperties = {
    background: 'linear-gradient(90deg, rgba(255,255,255,0.05) 25%, rgba(255,255,255,0.1) 50%, rgba(255,255,255,0.05) 75%)',
    backgroundSize: '200% 100%',
    animation: 'shimmer 1.5s infinite',
    borderRadius: '4px',
    height,
    width,
    marginBottom: '8px',
    ...style
  };

  return (
    <>
      <style>
        {`
          @keyframes shimmer {
            0% { background-position: -200% 0; }
            100% { background-position: 200% 0; }
          }
        `}
      </style>
      {Array.from({ length: count }).map((_, i) => (
        <div key={i} style={defaultStyle} />
      ))}
    </>
  );
};

export default SkeletonLoader;
