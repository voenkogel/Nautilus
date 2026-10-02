import React from 'react';

interface SwitchProps {
  checked: boolean;
  onChange: (checked: boolean) => void;
  className?: string;
  id?: string;
  disabled?: boolean;
  accentColor?: string;
}

const Switch: React.FC<SwitchProps> = ({ 
  checked, 
  onChange, 
  className = '', 
  id,
  disabled = false,
  accentColor = '#3b82f6'
}) => {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={checked}
      id={id}
      disabled={disabled}
      onClick={() => !disabled && onChange(!checked)}
      className={`nautilus-switch ${className}`}
      style={{ '--switch-accent': accentColor } as React.CSSProperties}
    >
      <span aria-hidden="true" className="switch-thumb" />
    </button>
  );
};

export default Switch;
