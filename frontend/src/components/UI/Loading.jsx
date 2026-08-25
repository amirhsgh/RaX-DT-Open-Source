import React from 'react';
import { cn } from '../../utils/cn';

/**
 * Loading Spinner Component
 * Based on the nightingale design system
 *
 * @param {string} size - 'sm' | 'md' | 'lg' | 'xl'
 * @param {string} variant - 'primary' | 'secondary' | 'white'
 * @param {boolean} fullScreen - Show full screen loading
 * @param {string} text - Loading text
 */
export function Loading({
  size = 'md',
  variant = 'primary',
  fullScreen = false,
  text,
  className,
  ...props
}) {
  const sizeClasses = {
    sm: 'w-4 h-4',
    md: 'w-8 h-8',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
  };

  const variantClasses = {
    primary: 'text-primary',
    secondary: 'text-secondary',
    white: 'text-white',
    neutral: 'text-muted-foreground',
  };

  const spinner = (
    <svg
      className={cn('animate-spin', sizeClasses[size], variantClasses[variant], className)}
      xmlns="http://www.w3.org/2000/svg"
      fill="none"
      viewBox="0 0 24 24"
      {...props}
    >
      <circle
        className="opacity-25"
        cx="12"
        cy="12"
        r="10"
        stroke="currentColor"
        strokeWidth="4"
      />
      <path
        className="opacity-75"
        fill="currentColor"
        d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
      />
    </svg>
  );

  if (fullScreen) {
    return (
      <div className="fixed inset-0 z-50 flex flex-col items-center justify-center bg-background/90 backdrop-blur-sm">
        {spinner}
        {text && (
          <p className="mt-4 text-lg font-medium text-foreground">
            {text}
          </p>
        )}
      </div>
    );
  }

  return (
    <div className="flex flex-col items-center justify-center">
      {spinner}
      {text && (
        <p className="mt-2 text-sm font-medium text-muted-foreground">
          {text}
        </p>
      )}
    </div>
  );
}

/**
 * LoadingDots Component
 * Alternative loading indicator with bouncing dots
 */
export function LoadingDots({ variant = 'primary', className }) {
  const variantClasses = {
    primary: 'bg-primary',
    secondary: 'bg-secondary',
    white: 'bg-white',
    neutral: 'bg-muted-foreground',
  };

  return (
    <div className={cn('flex items-center space-x-2', className)}>
      <div className={cn('w-2 h-2 rounded-full animate-bounce', variantClasses[variant])} style={{ animationDelay: '0ms' }} />
      <div className={cn('w-2 h-2 rounded-full animate-bounce', variantClasses[variant])} style={{ animationDelay: '150ms' }} />
      <div className={cn('w-2 h-2 rounded-full animate-bounce', variantClasses[variant])} style={{ animationDelay: '300ms' }} />
    </div>
  );
}

export default Loading;
