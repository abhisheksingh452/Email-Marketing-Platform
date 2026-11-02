import { ValidationOptions, registerDecorator } from 'class-validator';

export function IsIanaTimezone(options?: ValidationOptions) {
  return (object: object, propertyName: string) =>
    registerDecorator({
      name: 'isIanaTimezone',
      target: object.constructor,
      propertyName,
      options: { message: 'timezone must be a valid IANA timezone, e.g. Asia/Kolkata', ...options },
      validator: {
        validate(value: unknown) {
          if (typeof value !== 'string') return false;
          try {
            new Intl.DateTimeFormat('en-US', { timeZone: value });
            return true;
          } catch {
            return false;
          }
        },
      },
    });
}
