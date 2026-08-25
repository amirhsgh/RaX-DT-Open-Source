import * as React from 'react';
import * as LabelPrimitive from '@radix-ui/react-label';
import { Slot } from '@radix-ui/react-slot';
import { Controller, FormProvider, useFormContext } from 'react-hook-form';
import { cn } from '../../utils/cn';
import { Label } from './label';

const AntdFormContext = React.createContext(null);
const FormFieldContext = React.createContext({});

const FormField = ({ ...props }) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
};

const useFormField = () => {
  const fieldContext = React.useContext(FormFieldContext);
  const itemContext = React.useContext(FormItemContext);
  const { getFieldState, formState } = useFormContext();

  const fieldState = getFieldState(fieldContext.name, formState);

  if (!fieldContext) {
    throw new Error('useFormField should be used within <FormField>');
  }

  const { id } = itemContext;

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
    ...fieldState,
  };
};

const FormItemContext = React.createContext({});

const BaseFormItem = React.forwardRef(({ className, hidden, ...props }, ref) => {
  const id = React.useId();

  return (
    <FormItemContext.Provider value={{ id }}>
      <div
        ref={ref}
        className={cn(hidden && 'hidden', 'space-y-2', className)}
        {...props}
      />
    </FormItemContext.Provider>
  );
});
BaseFormItem.displayName = 'FormItem';

const FormLabel = React.forwardRef(({ className, ...props }, ref) => {
  const { error, formItemId } = useFormField();

  return (
    <Label
      ref={ref}
      className={cn(error && 'text-destructive', className)}
      htmlFor={formItemId}
      {...props}
    />
  );
});
FormLabel.displayName = 'FormLabel';

const FormControl = React.forwardRef(({ ...props }, ref) => {
  const { error, formItemId, formDescriptionId, formMessageId } = useFormField();

  return (
    <Slot
      ref={ref}
      id={formItemId}
      aria-describedby={
        !error
          ? `${formDescriptionId}`
          : `${formDescriptionId} ${formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  );
});
FormControl.displayName = 'FormControl';

const FormDescription = React.forwardRef(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormField();

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn('text-sm text-muted-foreground', className)}
      {...props}
    />
  );
});
FormDescription.displayName = 'FormDescription';

const FormMessage = React.forwardRef(({ className, children, ...props }, ref) => {
  const { error, formMessageId } = useFormField();
  const body = error ? String(error?.message) : children;

  if (!body) {
    return null;
  }

  return (
    <p
      ref={ref}
      id={formMessageId}
      className={cn('text-sm font-medium text-destructive', className)}
      {...props}
    >
      {body}
    </p>
  );
});
FormMessage.displayName = 'FormMessage';

const mapAntdRulesToRHF = (rules = []) => {
  return rules.reduce((acc, rule) => {
    if (!rule) return acc;
    if (rule.required) {
      acc.required = rule.message || 'This field is required';
    }
    if (rule.min !== undefined) {
      if (rule.type === 'number') {
        acc.min = {
          value: rule.min,
          message: rule.message || `Minimum value is ${rule.min}`,
        };
      } else {
        acc.minLength = {
          value: rule.min,
          message: rule.message || `Minimum length is ${rule.min}`,
        };
      }
    }
    if (rule.max !== undefined) {
      if (rule.type === 'number') {
        acc.max = {
          value: rule.max,
          message: rule.message || `Maximum value is ${rule.max}`,
        };
      } else {
        acc.maxLength = {
          value: rule.max,
          message: rule.message || `Maximum length is ${rule.max}`,
        };
      }
    }
    if (rule.pattern) {
      acc.pattern = {
        value: rule.pattern,
        message: rule.message || 'Invalid value',
      };
    }
    if (typeof rule.validator === 'function') {
      acc.validate = rule.validator;
    }
    return acc;
  }, {});
};

const ensureAntdFormCompat = (form) => {
  if (!form || form.__antdCompat) {
    return form;
  }

  form.getFieldValue = (name) => form.getValues(name);
  form.getFieldsValue = (names) => form.getValues(names);
  form.setFieldValue = (name, value, options = {}) =>
    form.setValue(name, value, { shouldDirty: true, ...options });
  form.setFieldsValue = (values = {}) => {
    Object.entries(values).forEach(([key, value]) => {
      form.setValue(key, value, { shouldDirty: false });
    });
  };
  form.resetFields = (names) => {
    if (!names) {
      form.reset();
      return;
    }
    const fieldArray = Array.isArray(names) ? names : [names];
    fieldArray.forEach((fieldName) => {
      if (form.resetField) {
        form.resetField(fieldName);
      } else {
        form.setValue(fieldName, undefined, { shouldDirty: false });
      }
    });
  };
  form.validateFields = async (names) => {
    const valid = await form.trigger(names);
    if (!valid) {
      const errors = form.formState?.errors || {};
      const firstErrorKey = Object.keys(errors)[0];
      const firstMessage = firstErrorKey ? errors[firstErrorKey]?.message : undefined;
      const error = new Error(firstMessage || 'Validation failed');
      error.errorFields = errors;
      throw error;
    }
    return form.getValues(names);
  };

  form.__antdCompat = true;
  return form;
};

const FormRoot = ({
  form,
  children,
  layout = 'vertical',
  className,
  onFinish,
  as: Component = 'form',
  ...props
}) => {
  if (!form || !form.control) {
    throw new Error('Form component requires a `form` prop created with useForm()');
  }

  ensureAntdFormCompat(form);

  const layoutClass =
    layout === 'inline'
      ? 'flex flex-wrap items-end gap-4'
      : layout === 'horizontal'
        ? 'space-y-4'
        : 'space-y-6';

  const handleSubmit = onFinish ? form.handleSubmit(onFinish) : props.onSubmit;

  return (
    <AntdFormContext.Provider value={{ form, layout }}>
      <FormProvider {...form}>
        <Component
          className={cn(layoutClass, className)}
          onSubmit={handleSubmit}
          {...props}
        >
          {children}
        </Component>
      </FormProvider>
    </AntdFormContext.Provider>
  );
};

const AntdFormItem = ({
  name,
  label,
  rules = [],
  initialValue,
  help,
  extra,
  valuePropName = 'value',
  getValueFromEvent,
  hidden,
  className,
  children,
  ...props
}) => {
  const context = React.useContext(AntdFormContext);

  if (!context || !context.form) {
    throw new Error('Form.Item must be used within a Form component');
  }

  const { form } = context;

  React.useEffect(() => {
    if (!name || initialValue === undefined) return;
    const currentValue = form.getValues(name);
    if (currentValue === undefined) {
      form.setValue(name, initialValue, { shouldDirty: false });
    }
  }, [form, name, initialValue]);

  if (!name) {
    return (
      <BaseFormItem className={className} hidden={hidden} {...props}>
        {label && <FormLabel>{label}</FormLabel>}
        {children}
        {help && <FormDescription>{help}</FormDescription>}
        <FormMessage />
      </BaseFormItem>
    );
  }

  const rhfRules = mapAntdRulesToRHF(Array.isArray(rules) ? rules : [rules]);

  return (
    <FormField
      control={form.control}
      name={name}
      rules={rhfRules}
      render={({ field }) => {
        const child = React.Children.only(children);
        const isCheckbox = valuePropName === 'checked';
        const childType = child.type || {};
        const isInputNumber =
          childType.displayName === 'InputNumber' ||
          childType.name === 'InputNumber';
        const isNumberInput =
          isInputNumber || child.props.type === 'number';

        const handleChange = (...args) => {
          let newValue;
          if (getValueFromEvent) {
            newValue = getValueFromEvent(...args);
          } else if (isCheckbox) {
            const event = args[0];
            if (event && event.target !== undefined) {
              newValue = event.target.checked;
            } else {
              newValue = !!event;
            }
          } else if (args[0] && args[0].target !== undefined) {
            newValue = args[0].target[valuePropName];
          } else {
            newValue = args[0];
          }
          field.onChange(newValue);
          if (typeof child.props.onChange === 'function') {
            child.props.onChange(...args);
          }
        };

        const handleBlur = (...args) => {
          field.onBlur();
          if (typeof child.props.onBlur === 'function') {
            child.props.onBlur(...args);
          }
        };

        const value = valuePropName === 'checked'
          ? !!field.value
          : isNumberInput
            ? (field.value ?? null)
            : field.value ?? (child.props.defaultValue !== undefined ? child.props.defaultValue : '');

        const clonedChild = React.cloneElement(child, {
          ...child.props,
          id: field.name,
          [valuePropName]: value,
          onChange: handleChange,
          onBlur: handleBlur,
        });

        return (
          <BaseFormItem className={className} hidden={hidden} {...props}>
            {label && <FormLabel>{label}</FormLabel>}
            <FormControl>{clonedChild}</FormControl>
            {extra && <FormDescription>{extra}</FormDescription>}
            {help && !form.formState.errors[name] && (
              <FormDescription>{help}</FormDescription>
            )}
            <FormMessage />
          </BaseFormItem>
        );
      }}
    />
  );
};

const Form = Object.assign(FormRoot, {
  Item: AntdFormItem,
});

export {
  useFormField,
  Form,
  BaseFormItem as FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
  ensureAntdFormCompat as withAntdForm,
};
