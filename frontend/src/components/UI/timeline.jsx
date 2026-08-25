import * as React from "react"
import { cn } from "../../utils/cn"

const Timeline = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div ref={ref} className={cn("space-y-4", className)} {...props}>
      {children}
    </div>
  )
})
Timeline.displayName = "Timeline"

const TimelineItem = React.forwardRef(({ className, children, color = "gray", dot, ...props }, ref) => {
  const colorClasses = {
    gray: "bg-gray-400",
    blue: "bg-blue-500",
    green: "bg-green-500",
    red: "bg-red-500",
    yellow: "bg-yellow-500",
  }

  return (
    <div ref={ref} className={cn("flex gap-4 items-start", className)} {...props}>
      <div className="flex flex-col items-center">
        <div className="mt-2 flex items-center justify-center">
          {dot ? (
            <div className="flex h-6 w-6 items-center justify-center rounded-full bg-primary text-primary-foreground text-xs font-semibold">
              {dot}
            </div>
          ) : (
            <div className={cn("w-2 h-2 rounded-full", colorClasses[color] || colorClasses.gray)} />
          )}
        </div>
        <div className="w-px h-full bg-border mt-1" />
      </div>
      <div className="flex-1 pb-8">
        {children}
      </div>
    </div>
  )
})
TimelineItem.displayName = "TimelineItem"

Timeline.Item = TimelineItem

export { Timeline, TimelineItem }
