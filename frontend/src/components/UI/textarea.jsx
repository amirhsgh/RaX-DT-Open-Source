import * as React from 'react';
import { cn } from '../../utils/cn';

const Textarea = React.forwardRef(({ className, ...props }, ref) => {
  return (
    <textarea
    // className={cn(
    //     'flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-base file:border-0 file:bg-transparent file:text-sm file:font-medium file:text-foreground placeholder:text-muted-foreground',
    //     'focus:outline-none focus-visible:outline-none focus:ring-0 focus:ring-offset-0 focus:border-transparent focus:shadow-none',
    //     'disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
    //     error && 'border-destructive',
    //     className
    //   )}
      className={cn(
        'flex min-h-[80px] w-full rounded-md border border-input bg-background px-3 py-2 text-base placeholder:text-muted-foreground focus:outline-none focus-visible:outline-none focus:ring-ring focus:ring-offset-0 focus:border-transparent focus:shadow-none disabled:cursor-not-allowed disabled:opacity-50 md:text-sm',
        className
      )}
      ref={ref}
      {...props}
    />
  );
});
Textarea.displayName = 'Textarea';

export { Textarea };
