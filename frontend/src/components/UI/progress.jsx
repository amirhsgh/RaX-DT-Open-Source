import * as React from 'react';
import * as ProgressPrimitive from '@radix-ui/react-progress';
import { cn } from '../../utils/cn';

const Progress = React.forwardRef(({
  className,
  value,
  percent, // Support both value and percent
  status = 'normal', // normal, active, success, exception
  strokeColor,
  size = 'default', // small, default, large
  format,
  showInfo = true,
  ...props
}, ref) => {
  // Use percent if provided, otherwise use value
  const progressValue = percent !== undefined ? percent : (value || 0);

  // Determine colors based on status
  let barColor = 'bg-primary';
  let textColor = 'text-foreground';

  if (status === 'success') {
    barColor = 'bg-green-500';
    textColor = 'text-green-600';
  } else if (status === 'exception') {
    barColor = 'bg-red-500';
    textColor = 'text-red-600';
  } else if (status === 'active') {
    barColor = 'bg-primary';
    textColor = 'text-primary';
  }

  // If strokeColor is provided as object (gradient), use it
  let barStyle = {};
  if (strokeColor && typeof strokeColor === 'object') {
    const gradientStops = Object.entries(strokeColor).map(([key, value]) => `${value} ${key}`).join(', ');
    barStyle = {
      background: `linear-gradient(to right, ${gradientStops})`
    };
  } else if (strokeColor && typeof strokeColor === 'string') {
    barStyle = { backgroundColor: strokeColor };
  }

  // Determine height based on size
  let heightClass = 'h-3';
  if (size === 'small') heightClass = 'h-2';
  if (size === 'large') heightClass = 'h-4';

  // Format percentage text
  let percentText = `${Math.round(progressValue)}%`;
  if (format && typeof format === 'function') {
    percentText = format(progressValue);
  }

  return (
    <div className="flex items-center gap-3 w-full">
      <ProgressPrimitive.Root
        ref={ref}
        className={cn(
          'relative w-full overflow-hidden rounded-full bg-secondary/30 dark:bg-secondary/20',
          heightClass,
          className
        )}
        {...props}
      >
        <ProgressPrimitive.Indicator
          className={cn(
            'h-full flex-1 transition-all duration-500 ease-out',
            !strokeColor && barColor,
            status === 'active' && 'animate-pulse'
          )}
          style={{
            transform: `translateX(-${100 - (progressValue || 0)}%)`,
            ...barStyle
          }}
        />
      </ProgressPrimitive.Root>

      {showInfo && (
        <span className={cn(
          'flex-shrink-0 text-sm font-medium min-w-[3rem] text-right',
          textColor
        )}>
          {percentText}
        </span>
      )}
    </div>
  );
});

Progress.displayName = ProgressPrimitive.Root.displayName;

export { Progress };
