// Phone numbers as the school types them into Settings ("0545563536", "+233 54 556 3536"),
// turned into what a visitor reads and taps.

// The international digits of a Ghanaian number, or null for anything else.
function ghanaDigits(raw: string): string | null {
  const digits = raw.replace(/\D/g, "");
  if (digits.length === 10 && digits.startsWith("0")) return `233${digits.slice(1)}`;
  if (digits.length === 12 && digits.startsWith("233")) return digits;
  if (digits.length === 9) return `233${digits}`;
  return null;
}

// "054 556 3536", the way numbers are written locally. Unrecognised numbers are left as typed.
export function formatPhone(raw: string): string {
  const international = ghanaDigits(raw);
  if (!international) return raw.trim();
  const local = `0${international.slice(3)}`;
  return `${local.slice(0, 3)} ${local.slice(3, 6)} ${local.slice(6)}`;
}

export function telHref(raw: string): string {
  const international = ghanaDigits(raw);
  return international ? `tel:+${international}` : `tel:${raw.replace(/[^\d+]/g, "")}`;
}

// A wa.me chat link, which needs the full international number; null when that is unknown.
export function whatsappHref(raw: string): string | null {
  const international = ghanaDigits(raw);
  return international ? `https://wa.me/${international}` : null;
}

// Settings holds the website as typed, often without the scheme.
export function websiteHref(raw: string): string | null {
  const trimmed = raw.trim();
  if (!trimmed) return null;
  const candidate = /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
  try {
    return new URL(candidate).toString();
  } catch {
    return null;
  }
}
