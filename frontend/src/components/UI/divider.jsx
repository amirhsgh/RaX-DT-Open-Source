import * as React from 'react';
import { cn } from '../../utils/cn';

/**
 * Divider component for Ant Design compatibility
 * A horizontal or vertical line to separate content
 */
export const Divider = ({
  className,
  orientation = 'horizontal',
  type = 'solid',
  children,
  dashed = false,
  plain = false,
  ...props
}) => {
  const isHorizontal = orientation === 'horizontal';
  const borderStyle = dashed ? 'border-dashed' : 'border-solid';

  if (children) {
    // Divider with text
    return (
      <div
        className={cn(
          'flex items-center my-4',
          isHorizontal ? 'flex-row' : 'flex-col',
          className
        )}
        {...props}
      >
        <div className={cn('flex-1', borderStyle, isHorizontal ? 'border-t' : 'border-l', 'border-border')} />
        <span className={cn(
          'px-4',
          plain ? 'text-sm text-muted-foreground' : 'text-sm font-medium text-foreground'
        )}>
          {children}
        </span>
        <div className={cn('flex-1', borderStyle, isHorizontal ? 'border-t' : 'border-l', 'border-border')} />
      </div>
    );
  }

  // Simple divider without text
  return (
    <div
      className={cn(
        borderStyle,
        isHorizontal
          ? 'w-full border-t border-border my-4'
          : 'h-full border-l border-border mx-4',
        className
      )}
      {...props}
    />
  );
};

export default Divider;
