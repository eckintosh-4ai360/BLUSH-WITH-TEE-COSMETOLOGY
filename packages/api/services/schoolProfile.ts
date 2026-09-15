import { inArray } from "drizzle-orm";
import { systemSettings } from "@blush/db/schema";
import type { DbExecutor } from "../dbOrThrow";

// The school's identity as the public website may show it: contact details and social links
// from Settings, without internal fields such as the registration number.
export type PublicSchoolProfile = {
  name: string;
  tagline: string | null;
  address: string | null;
  phone: string | null;
  whatsapp: string | null;
  email: string | null;
  website: string | null;
  social: {
    instagram: string | null;
    facebook: string | null;
    tiktok: string | null;
    youtube: string | null;
  };
};

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function text(value: unknown, max = 320): string | null {
  return typeof value === "string" && value.trim() ? value.trim().slice(0, max) : null;
}

// Social links only ever become hrefs, so anything but an http(s) address is dropped rather
// than rendered: a "javascript:" value typed into Settings must not reach a visitor.
function webLink(value: unknown): string | null {
  const candidate = text(value, 500);
  if (!candidate) return null;
  try {
    const url = new URL(candidate);
    return url.protocol === "https:" || url.protocol === "http:" ? url.toString() : null;
  } catch {
    return null;
  }
}

export function toPublicSchoolProfile(profile: unknown, social: unknown): PublicSchoolProfile {
  const school = asRecord(profile);
  const links = asRecord(social);

  return {
    name: text(school.name, 160) ?? "Blush With Tee",
    tagline: text(school.tagline, 200),
    address: text(school.address, 300),
    phone: text(school.phone, 40),
    whatsapp: text(school.whatsapp, 40),
    email: text(school.email, 320),
    website: text(school.website, 255),
    social: {
      instagram: webLink(links.instagram),
      facebook: webLink(links.facebook),
      tiktok: webLink(links.tiktok),
      youtube: webLink(links.youtube),
    },
  };
}

export async function readSchoolProfile(db: DbExecutor): Promise<PublicSchoolProfile> {
  const rows = await db
    .select({ key: systemSettings.key, value: systemSettings.value })
    .from(systemSettings)
    .where(inArray(systemSettings.key, ["school.profile", "school.social"]));

  const byKey = new Map(rows.map(row => [row.key, row.value]));
  return toPublicSchoolProfile(byKey.get("school.profile"), byKey.get("school.social"));
}
