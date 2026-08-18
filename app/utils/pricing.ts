/**
 * Session pricing.
 *
 * This lived as identical copies in the booking action and the order pass. Two
 * copies of the rule that decides what a customer is charged is exactly the
 * kind of thing that drifts silently, so it lives here once and both import it.
 *
 * Must stay free of server-only imports — the booking form prices in the
 * browser as the customer builds their order, and the server recomputes the
 * same figure authoritatively on submit.
 */

/**
 * Price of a session pack for one rider, before bike modifiers and extras.
 *
 * Below `discountThreshold` sessions each one costs full price. From the
 * threshold upwards the rider pays a bundled `discountThresholdPrice` for the
 * first `discountThreshold` sessions, then a reduced rate for each extra one.
 */
export function getSessionsBasePrice(
  sessions: number,
  basePricePerSession: number,
  discountThreshold: number,
  discountThresholdPrice: number,
  pricePerSessionAfterThreshold: number
): number {
  if (sessions < discountThreshold) {
    return sessions * basePricePerSession;
  }
  return (
    discountThresholdPrice +
    (sessions - discountThreshold) * pricePerSessionAfterThreshold
  );
}

/** Money is stored to the cent; keep float drift out of totals. */
export function roundMoney(amount: number): number {
  return Math.round(amount * 100) / 100;
}
