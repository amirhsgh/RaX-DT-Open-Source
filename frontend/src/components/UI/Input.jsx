import * as React from 'react';
import { cn } from '../../utils/cn';
import { Label } from './label';

export const Input = React.forwardRef(({ className, type, label, error, ...props }, ref) => {
  const input = (
    <input
      type={type}
      className={cn(
        'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground',
        'focus:outline-none focus-visible:outline-none focus:ring-ring focus:ring-offset-0 focus:border-transparent focus:shadow-none',
        'disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        error && 'border-destructive',
        className
      )}
      ref={ref}
      {...props}
    />
  );

  if (label || error) {
    return (
      <div className="w-full">
        {label && <Label className="mb-2">{label}</Label>}
        {input}
        {error && <p className="mt-2 text-sm text-destructive">{error}</p>}
      </div>
    );
  }

  return input;
});

Input.displayName = 'Input';

export default Input;
