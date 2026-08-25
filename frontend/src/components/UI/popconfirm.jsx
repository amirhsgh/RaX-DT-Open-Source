import * as React from "react"
import { cn } from "../../utils/cn"
import { Button } from './button'

const Popconfirm = ({
  children,
  title,
  description,
  onConfirm,
  onCancel,
  okText = "OK",
  cancelText = "Cancel",
  className,
  ...props
}) => {
  const [isOpen, setIsOpen] = React.useState(false)
  const popoverRef = React.useRef(null)

  React.useEffect(() => {
    const handleClickOutside = (event) => {
      if (popoverRef.current && !popoverRef.current.contains(event.target)) {
        setIsOpen(false)
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside)
    }

    return () => {
      document.removeEventListener('mousedown', handleClickOutside)
    }
  }, [isOpen])

  const handleConfirm = () => {
    if (onConfirm) onConfirm()
    setIsOpen(false)
  }

  const handleCancel = () => {
    if (onCancel) onCancel()
    setIsOpen(false)
  }

  return (
    <div className="relative inline-block" ref={popoverRef}>
      <div onClick={() => setIsOpen(!isOpen)}>
        {children}
      </div>

      {isOpen && (
        <div
          className={cn(
            "absolute z-50 w-72 rounded-md border bg-popover p-4 text-popover-foreground shadow-md outline-none animate-in fade-in-50 zoom-in-95",
            "bottom-full left-0 mb-2",
            className
          )}
          {...props}
        >
          <div className="space-y-2">
            <h4 className="font-medium leading-none">{title}</h4>
            {description && (
              <p className="text-sm text-muted-foreground">{description}</p>
            )}
          </div>
          <div className="flex justify-end gap-2 mt-4">
            <Button
              variant="outline"
              size="sm"
              onClick={handleCancel}
            >
              {cancelText}
            </Button>
            <Button
              size="sm"
              onClick={handleConfirm}
            >
              {okText}
            </Button>
          </div>
        </div>
      )}
    </div>
  )
}

export { Popconfirm }
