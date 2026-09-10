// Somebody's age in whole years, from the date on their birth certificate.
export function ageFromBirthDate(value: string, today: Date = new Date()): number | null {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value.trim());
  if (!match) return null;

  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);

  // Rejects the 31st of February and friends.
  const birth = new Date(year, month - 1, day);
  if (birth.getFullYear() !== year || birth.getMonth() !== month - 1 || birth.getDate() !== day) {
    return null;
  }

  let age = today.getFullYear() - year;
  const monthsToBirthday = today.getMonth() - (month - 1);
  if (monthsToBirthday < 0 || (monthsToBirthday === 0 && today.getDate() < day)) age -= 1;

  // A date in the future, or one implying a lifespan nobody has managed, is a typo rather.
  if (age < 0 || age > 120) return null;

  return age;
}
