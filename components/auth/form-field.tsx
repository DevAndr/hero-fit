import type { ComponentProps } from "react";
import { Field, FieldDescription, FieldError, FieldLabel } from "@/components/ui/field";
import { Input } from "@/components/ui/input";

type Props = ComponentProps<typeof Input> & {
  name: string;
  label: string;
  description?: string;
  errors?: string[];
};

export function FormField({ name, label, description, errors, ...input }: Props) {
  const invalid = Boolean(errors?.length);
  const id = `field-${name}`;

  return (
    <Field data-invalid={invalid || undefined}>
      <FieldLabel htmlFor={id}>{label}</FieldLabel>
      <Input id={id} name={name} aria-invalid={invalid || undefined} {...input} />
      {description && !invalid ? <FieldDescription>{description}</FieldDescription> : null}
      <FieldError errors={errors?.map((message) => ({ message }))} />
    </Field>
  );
}
