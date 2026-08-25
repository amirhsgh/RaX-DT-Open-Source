import * as React from 'react';
import { cn } from '../../utils/cn';
import { Check } from 'lucide-react';

/**
 * Steps component for Ant Design compatibility
 * A navigation bar that guides users through the steps of a task
 */
export const Steps = ({
  className,
  current = 0,
  children,
  direction = 'horizontal',
  size = 'default',
  status = 'process',
  ...props
}) => {
  const isHorizontal = direction === 'horizontal';
  const items = React.Children.toArray(children);

  return (
    <div
      className={cn(
        'flex',
        isHorizontal ? 'flex-row items-start' : 'flex-col',
        size === 'small' ? 'text-sm' : 'text-base',
        className
      )}
      {...props}
    >
      {items.map((child, index) => {
        const stepStatus =
          index < current ? 'finish' :
          index === current ? status :
          'wait';

        return React.cloneElement(child, {
          key: index,
          stepNumber: index + 1,
          status: stepStatus,
          isLast: index === items.length - 1,
          direction,
          size
        });
      })}
    </div>
  );
};

/**
 * Step component for individual steps
 */
export const Step = ({
  title,
  description,
  icon,
  stepNumber,
  status = 'wait',
  isLast = false,
  direction = 'horizontal',
  size = 'default',
  className,
  ...props
}) => {
  const isHorizontal = direction === 'horizontal';
  const isFinish = status === 'finish';
  const isProcess = status === 'process';
  const isError = status === 'error';
  const isWait = status === 'wait';

  const iconBgColor =
    isFinish ? 'bg-primary' :
    isProcess ? 'bg-primary' :
    isError ? 'bg-destructive' :
    'bg-muted';

  const iconTextColor =
    isFinish ? 'text-primary-foreground' :
    isProcess ? 'text-primary-foreground' :
    isError ? 'text-destructive-foreground' :
    'text-muted-foreground';

  const titleColor =
    isFinish ? 'text-foreground' :
    isProcess ? 'text-primary' :
    isError ? 'text-destructive' :
    'text-muted-foreground';

  return (
    <div
      className={cn(
        'flex',
        isHorizontal ? 'flex-1 flex-col items-center' : 'flex-row items-start',
        className
      )}
      {...props}
    >
      <div className={cn('flex items-center', isHorizontal ? 'w-full' : 'flex-col')}>
        {/* Step Icon/Number */}
        <div className="relative flex items-center justify-center">
          <div
            className={cn(
              'flex items-center justify-center rounded-full',
              size === 'small' ? 'h-6 w-6' : 'h-8 w-8',
              iconBgColor,
              iconTextColor,
              'font-medium transition-colors'
            )}
          >
            {isFinish ? (
              <Check className={size === 'small' ? 'h-3 w-3' : 'h-4 w-4'} />
            ) : icon ? (
              icon
            ) : (
              <span className={size === 'small' ? 'text-xs' : 'text-sm'}>{stepNumber}</span>
            )}
          </div>
        </div>

        {/* Connector Line */}
        {!isLast && (
          <div
            className={cn(
              isHorizontal ? 'flex-1 h-px mx-2' : 'w-px h-8 my-2 ml-4',
              isFinish ? 'bg-primary' : 'bg-border'
            )}
          />
        )}
      </div>

      {/* Step Content */}
      <div className={cn('mt-2', isHorizontal ? 'text-center' : 'ml-4 flex-1')}>
        <div className={cn('font-medium', titleColor, size === 'small' ? 'text-sm' : 'text-base')}>
          {title}
        </div>
        {description && (
          <div className={cn('text-muted-foreground', size === 'small' ? 'text-xs' : 'text-sm', 'mt-1')}>
            {description}
          </div>
        )}
      </div>
    </div>
  );
};

// Attach Step as a property of Steps for Ant Design compatibility
Steps.Step = Step;

export default Steps;
