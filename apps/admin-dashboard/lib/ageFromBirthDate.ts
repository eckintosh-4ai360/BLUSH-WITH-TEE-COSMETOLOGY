/**
 * Somebody's age in whole years, from the date on their birth certificate.
 *
 * Counted the way a person counts it: the year difference, less one if this
 * year's birthday has not come round yet. Doing it by dividing elapsed
 * milliseconds drifts by a day every leap year and eventually reads a
 * birthday as a day late, which on a form somebody signs is worth avoiding.
 *
 * The date arrives as the `yyyy-mm-dd` an `<input type="date">` produces, and
 * is read as a plain calendar date rather than an instant - parsing it with
 * `new Date(value)` would treat it as midnight UTC and, for anyone west of
 * Greenwich, land on the day before.
 */
export function ageFromBirthDate(value: string, today: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  // Rejects the 31st of February and friends: a real date survives the round
  // trip through the constructor, an invented one is rolled forward.
  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) {
    return null;
  }

  let age = today.getFullYear() - year;
  const monthsToBirthday = today.getMonth() - (month - 1);
  if (monthsToBirthday < 0 || (monthsToBirthday === 0 && today.getDate() < day)) age -= 1;

  // A date in the future, or one implying a lifespan nobody has managed, is a
  // typo rather than an age. Better a blank field than a confident wrong one.
  if (age < 0 || age > 120) return null;

  return age;
}
