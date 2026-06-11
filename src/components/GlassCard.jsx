import React from 'react';

const GlassCard = ({ children, className = '', glow = false, hover = false }) => {
  const baseClasses = glow ? 'glass-card-glow' : 'glass-card';
  const hoverClasses = hover ? 'transition-all duration-300 hover:scale-[1.01] hover:border-slate-400/20' : '';
  
  return (
    <div className={`rounded-xl p-5 ${baseClasses} ${hoverClasses} ${className}`}>
      {children}
    </div>
  );
};

export default GlassCard;
