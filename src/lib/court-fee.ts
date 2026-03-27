/**
 * Calculates the Polish civil court fee (opłata sądowa) for property-rights cases.
 * Based on Art. 13 ustawy z dnia 28 lipca 2005 r. o kosztach sądowych w sprawach cywilnych.
 *
 * @param claimValue - Claim value in PLN. Null, negative, NaN → returns null.
 * @returns Court fee in PLN, or null if the input is invalid.
 */
export function calculateCourtFee(claimValue: number | null): number | null {
  if (claimValue === null || !isFinite(claimValue) || claimValue < 0) return null;

  if (claimValue <= 500) return 30;
  if (claimValue <= 1500) return 100;
  if (claimValue <= 4000) return 200;
  if (claimValue <= 7500) return 400;
  if (claimValue <= 10000) return 500;
  if (claimValue <= 15000) return 750;
  if (claimValue <= 20000) return 1000;

  return Math.ceil(Math.min(claimValue * 0.05, 100000));
}
