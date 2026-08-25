import * as React from 'react';
import { cn } from '../../utils/cn';
import { X } from 'lucide-react';

const DialogContext = React.createContext({
  open: false,
  setOpen: () => {},
});

const Dialog = ({
  isOpen,
  open,
  onClose,
  onOpenChange,
  children,
  ...props
}) => {
  // Support both isOpen/onClose and open/onOpenChange patterns
  const [internalOpen, setInternalOpen] = React.useState(false);
  const isControlled = isOpen !== undefined || open !== undefined;
  const resolvedOpen = isControlled ? (isOpen !== undefined ? isOpen : open) : internalOpen;

  const handleSetOpen = React.useCallback((value) => {
    if (!isControlled) {
      setInternalOpen(value);
    }
    if (value === false) {
      if (onClose) onClose(false);
      if (onOpenChange) onOpenChange(false);
    } else if (value === true && onOpenChange) {
      onOpenChange(true);
    }
  }, [isControlled, onClose, onOpenChange]);

  const handleClose = React.useCallback(() => {
    handleSetOpen(false);
  }, [handleSetOpen]);

  React.useEffect(() => {
    if (resolvedOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [resolvedOpen]);

  React.useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && resolvedOpen) {
        handleClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [resolvedOpen, handleClose]);

  if (!resolvedOpen) return null;

  return (
    <DialogContext.Provider value={{ open: resolvedOpen, setOpen: handleSetOpen }}>
      <div className="relative z-50" {...props}>
        <DialogOverlay onClick={handleClose} />
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          {children}
        </div>
      </div>
    </DialogContext.Provider>
  );
};

const DialogOverlay = React.forwardRef(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      'fixed inset-0 z-50 bg-black/80 backdrop-blur-sm data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0',
      className
    )}
    {...props}
  />
));
DialogOverlay.displayName = 'DialogOverlay';

const DialogContent = React.forwardRef(
  ({ className, children, size = 'md', closeOnBackdropClick = true, onClose, onOpenChange, ...props }, ref) => {
    const context = React.useContext(DialogContext);

    const handleClose = React.useCallback(() => {
      if (onClose) onClose(false);
      if (onOpenChange) onOpenChange(false);
      if (context?.setOpen) context.setOpen(false);
    }, [context, onClose, onOpenChange]);

    const sizeClasses = {
      sm: 'max-w-md',
      md: 'max-w-lg',
      lg: 'max-w-2xl',
      xl: 'max-w-4xl',
    };

    const handleBackdropClick = (e) => {
      if (closeOnBackdropClick && e.target === e.currentTarget) {
        handleClose();
      }
    };

    return (
      <div
        ref={ref}
        onClick={handleBackdropClick}
        className={cn(
          'fixed left-[50%] top-[50%] z-50 grid w-full translate-x-[-50%] translate-y-[-50%] gap-4 border border-border bg-background p-6 shadow-lg duration-200 data-[state=open]:animate-in data-[state=closed]:animate-out data-[state=closed]:fade-out-0 data-[state=open]:fade-in-0 data-[state=closed]:zoom-out-95 data-[state=open]:zoom-in-95 data-[state=closed]:slide-out-to-left-1/2 data-[state=closed]:slide-out-to-top-[48%] data-[state=open]:slide-in-from-left-1/2 data-[state=open]:slide-in-from-top-[48%] rounded-lg',
          sizeClasses[size],
          className
        )}
        {...props}
      >
        {children}
        <button
          onClick={handleClose}
          className="absolute right-4 top-4 rounded-sm opacity-70 ring-offset-background transition-opacity hover:opacity-100 focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2 disabled:pointer-events-none"
        >
          <X className="h-4 w-4" />
          <span className="sr-only">Close</span>
        </button>
      </div>
    );
  }
);
DialogContent.displayName = 'DialogContent';

const DialogHeader = ({ className, ...props }) => (
  <div
    className={cn(
      'flex flex-col space-y-1.5 text-center sm:text-left',
      className
    )}
    {...props}
  />
);
DialogHeader.displayName = 'DialogHeader';

const DialogFooter = ({ className, ...props }) => (
  <div
    className={cn(
      'flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2',
      className
    )}
    {...props}
  />
);
DialogFooter.displayName = 'DialogFooter';

const DialogTitle = React.forwardRef(({ className, ...props }, ref) => (
  <h2
    ref={ref}
    className={cn(
      'text-lg font-semibold leading-none tracking-tight',
      className
    )}
    {...props}
  />
));
DialogTitle.displayName = 'DialogTitle';

const DialogDescription = React.forwardRef(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn('text-sm text-muted-foreground', className)}
    {...props}
  />
));
DialogDescription.displayName = 'DialogDescription';

const DialogTrigger = React.forwardRef(({ asChild = false, ...props }, ref) => {
  const context = React.useContext(DialogContext);

  const handleClick = (event) => {
    if (props.onClick) {
      props.onClick(event);
    }
    if (context?.setOpen) {
      context.setOpen(true);
    }
  };

  if (asChild && React.isValidElement(props.children)) {
    return React.cloneElement(props.children, {
      ref,
      onClick: handleClick,
    });
  }

  return (
    <button ref={ref} type="button" {...props} onClick={handleClick} />
  );
});
DialogTrigger.displayName = 'DialogTrigger';

export {
  Dialog,
  DialogOverlay,
  DialogContent,
  DialogHeader,
  DialogFooter,
  DialogTitle,
  DialogDescription,
  DialogTrigger,
};
