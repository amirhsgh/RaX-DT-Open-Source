import * as React from 'react';
import { cn } from '../../utils/cn';

// List component for Ant Design compatibility
export const List = ({ children, dataSource, renderItem, itemLayout = 'horizontal', className, ...props }) => {
  return (
    <div className={cn('w-full space-y-2', className)} {...props}>
      {dataSource ? dataSource.map((item, index) => renderItem(item, index)) : children}
    </div>
  );
};

List.Item = ({ children, actions, className, ...props }) => {
  return (
    <div className={cn('flex items-center justify-between p-4 border-b border-border last:border-b-0', className)} {...props}>
      <div className="flex-1">{children}</div>
      {actions && (
        <div className="flex items-center gap-2 ml-4">
          {actions.map((action, index) => (
            <div key={index}>{action}</div>
          ))}
        </div>
      )}
    </div>
  );
};

List.Item.Meta = ({ avatar, title, description, className, ...props }) => {
  return (
    <div className={cn('flex items-start gap-3', className)} {...props}>
      {avatar && <div className="flex-shrink-0">{avatar}</div>}
      <div className="flex-1">
        {title && <div className="font-medium text-foreground">{title}</div>}
        {description && <div className="text-sm text-muted-foreground mt-1">{description}</div>}
      </div>
    </div>
  );
};

export default List;
