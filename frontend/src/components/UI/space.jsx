import * as React from 'react';
import { cn } from '../../utils/cn';

// Simple Space component for Ant Design compatibility
export const Space = ({ children, direction = 'horizontal', size = 'small', className, ...props }) => {
  const sizeMap = {
    small: direction === 'horizontal' ? 'gap-2' : 'gap-2',
    middle: direction === 'horizontal' ? 'gap-4' : 'gap-4',
    large: direction === 'horizontal' ? 'gap-6' : 'gap-6',
  };

  const gapClass = typeof size === 'number' ? `gap-[${size}px]` : sizeMap[size] || sizeMap.small;
  const flexDirection = direction === 'vertical' ? 'flex-col' : 'flex-row';

  return (
    <div className={cn('inline-flex items-center', flexDirection, gapClass, className)} {...props}>
      {children}
    </div>
  );
};

export default Space;
