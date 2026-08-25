import * as React from 'react';
import { cn } from '../../utils/cn';
import { Input } from './Input';

// InputNumber component for Ant Design compatibility
export const InputNumber = React.forwardRef(({
  className,
  min,
  max,
  step = 1,
  value,
  onChange,
  defaultValue,
  ...props
}, ref) => {
  const [internalValue, setInternalValue] = React.useState(defaultValue || value || 0);

  React.useEffect(() => {
    if (value !== undefined) {
      setInternalValue(value);
    }
  }, [value]);

  const handleChange = (e) => {
    let newValue = parseFloat(e.target.value);

    if (isNaN(newValue)) {
      newValue = min || 0;
    }

    if (min !== undefined && newValue < min) {
      newValue = min;
    }
    if (max !== undefined && newValue > max) {
      newValue = max;
    }

    setInternalValue(newValue);
    if (onChange) {
      onChange(newValue);
    }
  };

  return (
    <Input
      ref={ref}
      type="number"
      className={cn(className)}
      value={internalValue}
      onChange={handleChange}
      min={min}
      max={max}
      step={step}
      {...props}
    />
  );
});

InputNumber.displayName = 'InputNumber';

export default InputNumber;
