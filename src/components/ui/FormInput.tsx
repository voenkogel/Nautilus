import React from 'react';

interface FormInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  /** Focus-ring color (e.g. the app accent). */
  accentColor?: string;
}

/**
 * Shared text input with consistent border, padding, radius, and focus ring.
 */
export const FormInput: React.FC<FormInputProps> = ({ accentColor, className = '', style, ...props }) => {
  return (
    <input
      className={`w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 ${className}`}
      style={{ ...(accentColor ? { '--tw-ring-color': accentColor } : {}), ...style } as React.CSSProperties}
      {...props}
    />
  );
};

export default FormInput;
