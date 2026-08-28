import { emptySchema, type JSONSchema } from '@reflex/capability-model';
import {
  controlToProperty,
  fieldKey,
  inputType,
  isExposableControl,
  isFormControl,
  type FormControl,
} from './fieldSchema.js';

export interface FieldReport {
  key: string;
  control: FormControl;
  type: string;
  required: boolean;
  labelled: boolean;
  label?: string;
  description?: string;
}

export interface FormSchemaResult {
  schema: JSONSchema;
  fields: FieldReport[];
  /** Controls skipped because they carried no agent-settable value. */
  skipped: number;
  /** True when the form contains a password input, which we never expose. */
  hasPasswordField: boolean;
}

export interface DescribeControl {
  /**
   * Label and help text for a control. `label` is an authored label only;
   * `fallbackLabel` is a synthesised one (from the name attribute, say), good
   * enough to describe the field but not evidence of an accessible page.
   */
  (control: FormControl): { label?: string; description?: string; fallbackLabel?: string };
}

const controlsOf = (root: ParentNode): FormControl[] =>
  Array.from(root.querySelectorAll('input, select, textarea')).filter(isFormControl);

/**
 * Build a JSON Schema for every agent-settable control inside `root`
 * (a <form>, or any container acting as one).
 */
export const buildFormSchema = (root: ParentNode, describe?: DescribeControl): FormSchemaResult => {
  const schema = emptySchema();
  const required: string[] = [];
  const fields: FieldReport[] = [];
  const controls = controlsOf(root);
  const seenGroups = new Set<string>();
  let skipped = 0;
  let hasPasswordField = false;

  for (const control of controls) {
    const type = inputType(control);
    if (control instanceof HTMLInputElement && type === 'password') hasPasswordField = true;

    if (!isExposableControl(control)) {
      skipped += 1;
      continue;
    }

    const key = fieldKey(control);
    if (!key) {
      // Without a name or id there is no stable way to address the field later.
      skipped += 1;
      continue;
    }

    const grouped = type === 'radio' || type === 'checkbox';
    if (grouped) {
      if (seenGroups.has(key)) continue;
      seenGroups.add(key);
    } else if (schema.properties[key]) {
      continue;
    }

    const group = grouped
      ? controls.filter(
          (other): other is HTMLInputElement =>
            other instanceof HTMLInputElement && inputType(other) === type && fieldKey(other) === key,
        )
      : undefined;

    const resolved = describe?.(control) ?? {};
    const displayLabel = resolved.label ?? resolved.fallbackLabel;
    const groupLabels = group?.map((member) => {
      const memberLabel = describe?.(member);
      return memberLabel?.label ?? memberLabel?.fallbackLabel ?? member.value;
    });
    const description = resolved.description || displayLabel;

    const property = controlToProperty(control, {
      description,
      radioGroup: group,
      groupLabels,
    });
    if (!property) {
      skipped += 1;
      continue;
    }

    schema.properties[key] = property;

    // A radio group is required only if the whole group is; a single control speaks for itself.
    const isRequired = group && group.length > 1 ? group.some((member) => member.required) : control.required;
    if (isRequired) required.push(key);

    fields.push({
      key,
      control,
      type,
      required: Boolean(isRequired),
      labelled: Boolean(resolved.label),
      label: displayLabel,
      description: resolved.description,
    });
  }

  if (required.length > 0) schema.required = required;
  else delete schema.required;

  return { schema, fields, skipped, hasPasswordField };
};
