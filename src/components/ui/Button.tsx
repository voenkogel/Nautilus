import React from 'react';

type ButtonVariant = 'primary' | 'secondary' | 'danger' | 'ghost';

interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  /** Background color for the `primary` variant (e.g. the app accent color). */
  accentColor?: string;
}

const VARIANT_CLASSES: Record<ButtonVariant, string> = {
  primary: 'text-abyss bg-accent hover:opacity-90',
  secondary: 'text-ink bg-surface border border-line hover:bg-abyss',
  danger: 'text-white bg-red-600 hover:bg-red-700',
  ghost: 'text-muted hover:bg-raised',
};

/**
 * Shared button with consistent sizing, radius, focus ring, and disabled state.
 * `primary` takes its background from `accentColor` (the app accent) when given.
 */
export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(({
  variant = 'secondary',
  accentColor,
  className = '',
  style,
  children,
  ...props
}, ref) => {
  const base =
    'inline-flex items-center justify-center gap-2 px-4 py-2 rounded-md text-sm font-medium transition-colors focus:outline-none focus:ring-2 focus:ring-offset-2 disabled:opacity-50 disabled:cursor-not-allowed';
  const mergedStyle =
    variant === 'primary' ? { backgroundColor: accentColor || '#65d7e8', color: '#07141e', ...style } : style;
  return (
    <button ref={ref} className={`${base} ${VARIANT_CLASSES[variant]} ${className}`} style={mergedStyle} {...props}>
      {children}
    </button>
  );
});
Button.displayName = 'Button';

export default Button;
