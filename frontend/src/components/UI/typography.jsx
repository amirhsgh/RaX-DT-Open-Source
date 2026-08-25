import * as React from 'react';
import { cn } from '../../utils/cn';

/**
 * Typography components for Ant Design compatibility
 * Provides Title, Text, and Paragraph components with various styling options
 */

// Title component (h1-h5)
export const Title = ({ level = 1, className, children, type, ...props }) => {
  const Tag = `h${level}`;

  const typeClasses = {
    secondary: 'text-muted-foreground',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    danger: 'text-destructive'
  };

  const levelClasses = {
    1: 'text-4xl font-bold',
    2: 'text-3xl font-bold',
    3: 'text-2xl font-semibold',
    4: 'text-xl font-semibold',
    5: 'text-lg font-semibold'
  };

  return React.createElement(
    Tag,
    {
      className: cn(
        levelClasses[level],
        type && typeClasses[type],
        className
      ),
      ...props
    },
    children
  );
};

// Text component (span)
export const Text = ({
  className,
  children,
  type,
  strong,
  code,
  mark,
  delete: del,
  underline,
  disabled,
  ...props
}) => {
  const typeClasses = {
    secondary: 'text-muted-foreground',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    danger: 'text-destructive'
  };

  let content = children;

  if (code) {
    return (
      <code className={cn('px-1.5 py-0.5 bg-muted rounded text-sm font-mono', className)} {...props}>
        {children}
      </code>
    );
  }

  if (mark) {
    content = <mark className="bg-yellow-200 px-1">{content}</mark>;
  }

  if (strong) {
    content = <strong>{content}</strong>;
  }

  if (underline) {
    content = <u>{content}</u>;
  }

  if (del) {
    content = <del>{content}</del>;
  }

  return (
    <span
      className={cn(
        type && typeClasses[type],
        disabled && 'opacity-50 cursor-not-allowed',
        className
      )}
      {...props}
    >
      {content}
    </span>
  );
};

// Paragraph component (p)
export const Paragraph = ({ className, children, type, ellipsis, ...props }) => {
  const typeClasses = {
    secondary: 'text-muted-foreground',
    success: 'text-green-600',
    warning: 'text-yellow-600',
    danger: 'text-destructive'
  };

  return (
    <p
      className={cn(
        'text-base',
        type && typeClasses[type],
        ellipsis && 'truncate',
        className
      )}
      {...props}
    >
      {children}
    </p>
  );
};

// Typography namespace object for compatibility
const Typography = {
  Title,
  Text,
  Paragraph
};

export default Typography;
