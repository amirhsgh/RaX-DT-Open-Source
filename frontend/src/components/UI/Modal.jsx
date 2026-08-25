import * as React from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from './dialog';
import { Button } from './Button';

/**
 * Unified modal wrapper that bridges legacy Ant Design props with the
 * newer shadcn dialog implementation. Accepts `isOpen`, `open`, or `visible`
 * to control visibility and supports `onOk` / `onCancel` handlers in addition
 * to `onClose`.
 */
export function Modal({
  isOpen,
  open,
  visible,
  onClose,
  onCancel,
  onOk,
  size = 'md',
  title,
  description,
  children,
  footer,
  className,
  contentClassName,
  closeOnBackdropClick = true,
  okText = 'OK',
  cancelText = 'Cancel',
  okButtonProps = {},
  cancelButtonProps = {},
  confirmLoading = false,
  hideCancelButton = false,
  width,
  style,
  ...props
}) {
  const isModalOpen = React.useMemo(() => {
    if (typeof isOpen !== 'undefined') return isOpen;
    if (typeof open !== 'undefined') return open;
    if (typeof visible !== 'undefined') return visible;
    return false;
  }, [isOpen, open, visible]);

  const mergedStyle = React.useMemo(() => {
    if (!width && !style) return undefined;
    return {
      ...(width ? { width } : {}),
      ...style
    };
  }, [width, style]);

  const handleClose = React.useCallback(
    (value) => {
      if (onCancel) {
        onCancel(value);
      }
      if (onClose) {
        onClose(value);
      }
    },
    [onCancel, onClose]
  );

  const handleOk = React.useCallback(() => {
    if (onOk) {
      onOk();
    }
  }, [onOk]);

  const renderFooter = () => {
    if (footer === null) {
      return null;
    }

    if (footer !== undefined) {
      return <DialogFooter>{footer}</DialogFooter>;
    }

    const { variant: cancelVariant, ...restCancelButtonProps } = cancelButtonProps;
    const { variant: okVariant, ...restOkButtonProps } = okButtonProps;

    return (
      <DialogFooter className="gap-2 sm:justify-end">
        {!hideCancelButton && (
          <Button
            variant={cancelVariant || 'outline'}
            onClick={() => handleClose(false)}
            {...restCancelButtonProps}
          >
            {cancelText}
          </Button>
        )}
        <Button
          variant={okVariant || 'primary'}
          onClick={handleOk}
          loading={confirmLoading}
          {...restOkButtonProps}
        >
          {okText}
        </Button>
      </DialogFooter>
    );
  };

  return (
    <Dialog isOpen={isModalOpen} onClose={handleClose} {...props}>
      <DialogContent
        size={size}
        closeOnBackdropClick={closeOnBackdropClick}
        onClose={handleClose}
        className={className}
        style={mergedStyle}
      >
        {(title || description) && (
          <DialogHeader>
            {title && <DialogTitle>{title}</DialogTitle>}
            {description && <p className="text-sm text-muted-foreground">{description}</p>}
          </DialogHeader>
        )}
        <div className={`max-h-[calc(100vh-200px)] overflow-y-auto ${contentClassName || ''}`}>
          {children}
        </div>
        {renderFooter()}
      </DialogContent>
    </Dialog>
  );
}

export default Modal;
