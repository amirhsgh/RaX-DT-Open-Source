import * as React from 'react';
import { cn } from '../../utils/cn';

// Descriptions component for Ant Design compatibility
export const Descriptions = ({ children, bordered, className, ...props }) => {
  return (
    <div className={cn('w-full', className)} {...props}>
      <div className={cn('grid grid-cols-1 md:grid-cols-3 gap-4', bordered && 'border border-border rounded-lg p-4')}>
        {children}
      </div>
    </div>
  );
};

Descriptions.Item = ({ label, children, span = 1, className, ...props }) => {
  const spanClass = span === 2 ? 'md:col-span-2' : span === 3 ? 'md:col-span-3' : '';

  return (
    <div className={cn('flex flex-col space-y-1', spanClass, className)} {...props}>
      <dt className="text-sm font-medium text-muted-foreground">{label}</dt>
      <dd className="text-sm text-foreground">{children}</dd>
    </div>
  );
};

export default Descriptions;
