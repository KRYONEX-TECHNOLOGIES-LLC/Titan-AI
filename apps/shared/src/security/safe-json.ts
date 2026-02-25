import { ValidateFunction } from 'ajv';
import ajv from '../../config/ajv';

const SCHEMAS = new Map<string, ValidateFunction>();

export function registerSchema<T>(key: string, schema: object): void {
  SCHEMAS.set(key, ajv.compile<T>(schema));
}

export function safeParse<T>(jsonString: string, schemaKey: string): T {
  const validate = SCHEMAS.get(schemaKey);
  if (!validate) throw Error(`Schema ${schemaKey} not registered`);
  
  const data = JSON.parse(jsonString);
  if (!validate(data)) 
    throw Error(`Invalid ${schemaKey} payload: ${ajv.errorsText(validate.errors)}`);
  
  return data as T;
}

export function safeStringify<T>(data: T, schemaKey: string): string {
  const validate = SCHEMAS.get(schemaKey);
  if (!validate) throw Error(`Schema ${schemaKey} not registered`);
  
  if (!validate(data))
    throw Error(`Invalid ${schemaKey} response: ${ajv.errorsText(validate.errors)}`);
  
  return JSON.stringify(data);
}