/**
 * Currency handling.
 *
 * Money is held in the database as `numeric(12,2)` and returned by the driver
 * as a string. Every calculation in this codebase converts to integer minor
 * units (pesewas) first, so no balance is ever the result of adding floats.
 */

const MINOR_UNITS = 100;

/** Matches a plain decimal, which is how Postgres returns a `numeric` column. */
const DECIMAL = /^([+-])?(\d*)(?:\.(\d*))?$/;

/**
 * Parses a database numeric, a form number, or null into whole pesewas.
 *
 * Strings are parsed digit by digit rather than multiplied, because that is
 * where real money comes from: the driver hands back `numeric` as a string,
 * and `Number("0.07") * 100` is not exactly 7. Numbers go through `Math.round`
 * and inherit the usual binary-float limits, so prefer passing the string.
 */
export function toMinor(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;

  if (typeof value === "string") {
    const match = DECIMAL.exec(value.trim());
    if (match) {
      const sign = match[1] === "-" ? -1 : 1;
      const whole = match[2] || "0";
      // Three fractional digits: two to keep, one to round on.
      const fraction = (match[3] ?? "").slice(0, 3).padEnd(3, "0");
      const minor = Number(whole) * MINOR_UNITS + Number(fraction.slice(0, 2));
      return sign * (minor + (Number(fraction[2]) >= 5 ? 1 : 0));
    }
  }

  const numeric = Number(value);
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
