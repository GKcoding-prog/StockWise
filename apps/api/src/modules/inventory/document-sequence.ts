import { localDateOf } from '../../common/time';
import type { DocumentKind } from '../../generated/prisma/client';
import type { Tx } from '../../prisma/prisma.service';

const PREFIX: Record<DocumentKind, string> = {
  SALE: 'SAL',
  PURCHASE: 'PUR',
  ADJUSTMENT: 'ADJ',
  WRITE_OFF: 'WOF',
  STOCK_COUNT: 'CNT',
  CUSTOMER_RETURN: 'RET',
  SUPPLIER_RETURN: 'SRT',
};

/**
 * Next per-business, per-year reference, e.g. SAL-2026-000123 (invariant I10).
 * The upsert locks the counter row until the caller's transaction ends, so references are
 * unique; a rolled-back transaction leaves a gap, which is acceptable.
 */
export async function nextReference(
  tx: Tx,
  businessId: string,
  kind: DocumentKind,
  timeZone: string,
  at: Date = new Date(),
): Promise<string> {
  const year = Number(localDateOf(at, timeZone).slice(0, 4));
  const rows = await tx.$queryRaw<{ lastValue: number }[]>`
    INSERT INTO "document_sequences" ("businessId", "kind", "year", "lastValue")
    VALUES (${businessId}::uuid, ${kind}::"DocumentKind", ${year}, 1)
    ON CONFLICT ("businessId", "kind", "year")
    DO UPDATE SET "lastValue" = "document_sequences"."lastValue" + 1
    RETURNING "lastValue"`;
  return `${PREFIX[kind]}-${year}-${String(rows[0].lastValue).padStart(6, '0')}`;
}
