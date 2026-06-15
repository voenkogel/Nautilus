import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Background color for the `primary` variant (e.g. the app accent color). */
  accentColor?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'text-white hover:opacity-90',
  secondary: 'text-gray-700 bg-white border border-gray-300 hover:bg-gray-50',
  danger: 'text-white bg-red-600 hover:bg-red-700',
  ghost: 'text-gray-600 hover:bg-gray-100',
};

/**
 * Shared button with consistent sizing, radius, focus ring, and disabled state.
 * `primary` takes its background from `accentColor` (the app accent) when given.
 */
export const Button: React.FC<ButtonProps> = ({
  variant = 'secondary',
  accentColor,
  className = '',
  style,
  children,
  ...props
}) => {
  const base =
    'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  const mergedStyle =
    variant === 'primary' && accentColor ? { backgroundColor: accentColor, ...style } : style;
  return (
    <button className={`${base} ${VARIANT_CLASSES[variant]} ${className}`} style={mergedStyle} {...props}>
      {children}
    </button>
  );
};

export default Button;
