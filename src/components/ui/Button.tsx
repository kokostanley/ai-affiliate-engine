// UI Button
import { ButtonHTMLAttributes, forwardRef } from 'react';

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: 'primary' | 'secondary' | 'destructive' | 'ghost';
  size?: 'sm' | 'md' | 'lg';
}

export const Button = forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className = '', variant = 'primary', size = 'md', children, ...props }, ref) => {
    const baseClass = 'inline-flex items-center justify-center rounded-lg font-medium transition-colors focus:outline-none disabled:pointer-events-none disabled:opacity-50';

    let variantClass = 'bg-blue-600 text-white hover:bg-blue-700';
    if (variant === 'secondary') variantClass = 'bg-gray-800 text-gray-300 hover:bg-gray-700';
    if (variant === 'destructive') variantClass = 'bg-red-600 text-white hover:bg-red-700';
    if (variant === 'ghost') variantClass = 'bg-transparent text-gray-300 hover:bg-gray-800';

    let sizeClass = 'px-4 py-2 text-sm';
    if (size === 'sm') sizeClass = 'px-2.5 py-1.5 text-xs';
    if (size === 'lg') sizeClass = 'px-6 py-3 text-base';

    return (
      <button
        ref={ref}
        className={baseClass + ' ' + variantClass + ' ' + sizeClass + ' ' + className}
        {...props}
      >
        {children}
      </button>
    );
  }
);

Button.displayName = 'Button';