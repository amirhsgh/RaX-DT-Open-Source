import * as React from "react"
import { cn } from "../../utils/cn"

const Statistic = React.forwardRef(({ className, title, value, prefix, suffix, valueStyle, ...props }, ref) => {
  return (
    <div ref={ref} className={cn("space-y-2", className)} {...props}>
      {title && (
        <div className="text-sm font-medium text-muted-foreground">
          {title}
        </div>
      )}
      <div className={cn("text-2xl font-bold", valueStyle?.className)} style={valueStyle}>
        {prefix && <span className="mr-1">{prefix}</span>}
        {value}
        {suffix && <span className="ml-1">{suffix}</span>}
      </div>
    </div>
  )
})
Statistic.displayName = "Statistic"

export { Statistic }
