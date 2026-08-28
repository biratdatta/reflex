/**
 * The narrow slice of JSON Schema that Reflex generates from HTML.
 * Deliberately minimal: everything here must be derivable from markup.
 */
export type JSONSchemaType = 'object' | 'string' | 'number' | 'integer' | 'boolean' | 'array';

export interface JSONSchemaProperty {
  type: JSONSchemaType;
  description?: string;
  format?: 'email' | 'uri' | 'date' | 'date-time' | 'time' | 'password';
  enum?: string[];
  minimum?: number;
  maximum?: number;
  minLength?: number;
  maxLength?: number;
  pattern?: string;
  default?: string | number | boolean;
  items?: JSONSchemaProperty;
  /** Human-readable option labels, parallel to `enum`. Not standard JSON Schema; carried for UI/description use. */
  'x-reflex-enumLabels'?: string[];
}

export interface JSONSchema {
  type: 'object';
  properties: Record<string, JSONSchemaProperty>;
  required?: string[];
  additionalProperties?: boolean;
}

export const emptySchema = (): JSONSchema => ({
  type: 'object',
  properties: {},
  required: [],
  additionalProperties: false,
});
