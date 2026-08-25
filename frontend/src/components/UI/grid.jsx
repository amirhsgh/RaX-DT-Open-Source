import * as React from 'react';
import { cn } from '../../utils/cn';

// Simple Row component for Ant Design compatibility
export const Row = ({ gutter = 0, className, children, ...props }) => {
  const gutterClass = gutter ? `gap-${gutter / 4}` : '';
  return (
    <div className={cn('flex flex-wrap', gutterClass, className)} {...props}>
      {children}
    </div>
  );
};

// Simple Col component for Ant Design compatibility
export const Col = ({ span = 24, className, children, ...props }) => {
  // Convert antd 24-grid span to Tailwind flex basis
  const spanClass = span === 24 ? 'w-full' : span === 12 ? 'w-1/2' : span === 8 ? 'w-1/3' : span === 6 ? 'w-1/4' : 'w-full';

  return (
    <div className={cn('px-2', spanClass, className)} {...props}>
      {children}
    </div>
  );
};

export default { Row, Col };
