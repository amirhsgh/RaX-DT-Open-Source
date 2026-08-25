import * as React from 'react';
import * as CollapsiblePrimitive from '@radix-ui/react-collapsible';
import { ChevronDown } from 'lucide-react';
import { cn } from '../../utils/cn';

const Collapsible = CollapsiblePrimitive.Root;
const CollapsibleTrigger = CollapsiblePrimitive.Trigger;
const CollapsibleContent = CollapsiblePrimitive.Content;

// Ant Design compatible Collapse wrapper
const AntCollapse = ({ items = [], accordion = false, className, ...props }) => {
  const [openItems, setOpenItems] = React.useState([]);

  const handleToggle = (key) => {
    if (accordion) {
      setOpenItems(openItems.includes(key) ? [] : [key]);
    } else {
      setOpenItems(
        openItems.includes(key)
          ? openItems.filter((k) => k !== key)
          : [...openItems, key]
      );
    }
  };

  return (
    <div className={cn('space-y-2', className)} {...props}>
      {items.map((item) => (
        <Collapsible
          key={item.key}
          open={openItems.includes(item.key)}
          onOpenChange={() => handleToggle(item.key)}
        >
          <div className="border rounded-lg overflow-hidden">
            <CollapsibleTrigger className="flex w-full items-center justify-between px-4 py-3 font-medium transition-all hover:bg-muted [&[data-state=open]>svg]:rotate-180">
              {item.label}
              <ChevronDown className="h-4 w-4 shrink-0 transition-transform duration-200" />
            </CollapsibleTrigger>
            <CollapsibleContent className="overflow-hidden text-sm transition-all data-[state=closed]:animate-collapsible-up data-[state=open]:animate-collapsible-down">
              <div className="px-4 py-3 border-t">{item.children}</div>
            </CollapsibleContent>
          </div>
        </Collapsible>
      ))}
    </div>
  );
};

// Named exports for shadcn/ui compatibility
export { Collapsible, CollapsibleTrigger, CollapsibleContent };

// Default export for Ant Design compatibility
export default AntCollapse;

// Also export as Collapse for flexibility
export { AntCollapse as Collapse };
