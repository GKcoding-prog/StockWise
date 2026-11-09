import { Prisma } from '../../generated/prisma/client';

/** True when `err` is a unique-constraint violation, optionally on a specific column. */
export function isUniqueViolation(err: unknown, field?: string): boolean {
  if (!(err instanceof Prisma.PrismaClientKnownRequestError) || err.code !== 'P2002') return false;
  if (!field) return true;
  // Either column names, or an index name like "products_businessId_sku_key".
  return uniqueViolationFields(err).some((f) => f === field || f.split('_').includes(field));
}

function uniqueViolationFields(err: Prisma.PrismaClientKnownRequestError): string[] {
  const meta = err.meta as Record<string, unknown> | undefined;
  const target = meta?.target;
  if (Array.isArray(target)) return target.map(String);
  if (typeof target === 'string') return [target];
  // Driver adapters report the constraint in `meta.driverAdapterError.cause`.
  const cause = (meta?.driverAdapterError as { cause?: Record<string, unknown> } | undefined)
    ?.cause;
  const constraint = cause?.constraint as { fields?: string[]; index?: string } | undefined;
  if (constraint?.fields) return constraint.fields.map((f) => f.replace(/"/g, ''));
  if (constraint?.index) return [constraint.index];
  return [];
}
