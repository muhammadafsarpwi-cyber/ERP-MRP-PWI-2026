import { Matches, ValidationOptions } from 'class-validator';

export const UUID_SHAPE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export const IsUuid = (validationOptions?: ValidationOptions) =>
  Matches(UUID_SHAPE, { message: '$property must be a UUID', ...validationOptions });