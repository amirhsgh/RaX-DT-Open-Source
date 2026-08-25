import * as React from 'react';
import { cva } from 'class-variance-authority';
import { cn } from '../../utils/cn';

const badgeVariants = cva(
  'inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2',
  {
    variants: {
      variant: {
        default: 'border-transparent bg-primary text-primary-foreground hover:bg-primary/80',
        secondary: 'border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80',
        destructive: 'border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80',
        outline: 'text-foreground',
        success: 'bg-primary/10 text-primary border-primary/30',
        error: 'bg-destructive/10 text-destructive border-destructive/30',
        warning: 'bg-accent/10 text-accent-foreground border-accent/30',
        info: 'bg-accent/10 text-accent-foreground border-accent/30',
        neutral: 'bg-muted text-muted-foreground border-border',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  }
);

export function Badge({ className, variant, ...props }) {
  return (
    <div className={cn(badgeVariants({ variant }), className)} {...props} />
  );
}

// Tag is an alias for Badge (for Ant Design compatibility)
export const Tag = ({ color, children, icon, className, ...props }) => {
  // Map Ant Design colors to Badge variants
  const variantMap = {
    default: 'neutral',
    processing: 'info',
    success: 'success',
    error: 'error',
    warning: 'warning',
  };

  const variant = variantMap[color] || 'default';

  return (
    <Badge variant={variant} className={cn('inline-flex items-center gap-1', className)} {...props}>
      {icon && <span className="inline-flex">{icon}</span>}
      {children}
    </Badge>
  );
};

export default Badge;
