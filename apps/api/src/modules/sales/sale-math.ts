import { Decimal, ZERO, roundMoney } from '../../common/decimal';

/** Discount as a percentage of the line at the selling price. 0 for a free product. */
export function discountPercent(l: {
  quantity: Decimal;
  listPrice: Decimal;
  lineTotal: Decimal;
}): Decimal {
  const listGross = roundMoney(l.quantity.times(l.listPrice));
  if (listGross.lte(0)) return ZERO;
  const discount = listGross.minus(l.lineTotal);
  if (discount.lte(0)) return ZERO;
  return discount.dividedBy(listGross).times(100);
}

/** Paid amount for `returned` units of a line, pro rata: lineTotal × returned ÷ quantity. */
export function refundShare(
  item: { lineTotal: Decimal; quantity: Decimal },
  returned: Decimal,
): Decimal {
  return roundMoney(item.lineTotal.times(returned).dividedBy(item.quantity));
}
