import React from 'react';

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Focus-ring color (e.g. the app accent). */
  accentColor?: string;
}

/**
 * Shared text input with consistent border, padding, radius, and focus ring.
 */
export const FormInput = React.forwardRef<HTMLInputElement, FormInputProps>(
  ({ accentColor, className = '', style, ...props }, ref) => {
    return (
      <input
        ref={ref}
        className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 ${className}`}
        style={{ ...(accentColor ? { '--tw-ring-color': accentColor } : {}), ...style } as React.CSSProperties}
        {...props}
      />
    );
  }
);
FormInput.displayName = 'FormInput';

export default FormInput;
