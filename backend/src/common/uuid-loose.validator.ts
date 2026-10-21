import { ValidateBy, ValidationOptions, buildMessage } from 'class-validator';

/**
 * Version-agnostic UUID pattern (8-4-4-4-12 hex).
 *
 * Seed/sample data in this ERP uses synthetic IDs such as
 * `c1000000-0000-0000-0000-000000000001` / `d1000000-...`. PostgreSQL accepts
 * them as valid `uuid` values, but class-validator's built-in `@IsUUID()`
 * enforces an RFC version nibble (1-8) and rejects them — which made saves
 * fail with "xxxId must be a UUID" for perfectly valid DB records.
 */
export const UUID_LOOSE_REGEX = /^[0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12}$/;

export function isLooseUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_LOOSE_REGEX.test(value);
}

/**
 * Drop-in replacement for class-validator's `@IsUUID(version?, options?)`.
 * The `version` argument is accepted for signature compatibility but ignored;
 * all other validation options (`each`, `message`, `groups`, ...) still apply.
 */
export function IsUUID(_version?: unknown, validationOptions?: ValidationOptions): PropertyDecorator {
  return ValidateBy(
    {
      name: 'isUuid',
      validator: {
        validate: (value: unknown): boolean => isLooseUuid(value),
        defaultMessage: buildMessage((eachPrefix) => `${eachPrefix}$property must be a UUID`, validationOptions),
      },
    },
    validationOptions,
  );
}
