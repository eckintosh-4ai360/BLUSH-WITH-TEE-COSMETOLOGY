/**
 * Currency handling.
 *
 * Money is held in the database as `numeric(12,2)` and returned by the driver
 * as a string. Every calculation in this codebase converts to integer minor
 * units (pesewas) first, so no balance is ever the result of adding floats.
 */

const MINOR_UNITS = 100;

/** Parses a database numeric, a form number, or null into whole pesewas. */
export function toMinor(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const numeric = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(numeric)) return 0;
  return Math.round(numeric * MINOR_UNITS);
}

/** Converts pesewas back to a major-unit number, for display and API output. */
export function fromMinor(minor: number): number {
  return Math.round(minor) / MINOR_UNITS;
}

/** Formats pesewas as the fixed-scale string the numeric columns expect. */
export function toAmountString(minor: number): string {
  return (Math.round(minor) / MINOR_UNITS).toFixed(2);
}

/** Converts a major-unit input straight to the storage string. */
export function amountString(value: string | number | null | undefined): string {
  return toAmountString(toMinor(value));
}

export function sumMinor(values: Array<string | number | null | undefined>): number {
  return values.reduce<number>((total, value) => total + toMinor(value), 0);
}

/**
 * Legacy helper retained because much of the API returns plain numbers to the
 * client. Prefer `toMinor` for anything that will be added up.
 */
export function money(value: string | number | null | undefined): number {
  return fromMinor(toMinor(value));
}

export function formatCurrency(value: string | number | null | undefined, currency = "GHS"): string {
  return `${currency} ${money(value).toFixed(2)}`;
}
