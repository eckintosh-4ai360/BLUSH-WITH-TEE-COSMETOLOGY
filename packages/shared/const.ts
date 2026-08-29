export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = "Please sign in to continue.";
export const NOT_ADMIN_ERR_MSG = "You do not have permission to do that.";

/** Where each app sends a signed-out visitor. */
export const LOGIN_PATH = "/login";

/**
 * How the prospectus is split.
 *
 * "General" holds the three full programmes a student enrols on for months at a
 * time; "Individual Courses" holds the single-skill courses sold on their own.
 * Both apps group by these, so they are defined once rather than typed into a
 * dropdown on one side and a seed file on the other.
 */
export const COURSE_CATEGORIES = ["General", "Individual Courses"] as const;

export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

export const DEFAULT_COURSE_CATEGORY: CourseCategory = "General";

/**
 * Prospectus order: General first, then Individual Courses.
 *
 * Both apps build their category filter from whatever categories the courses
 * actually carry, which arrives in row order - so without this the full
 * programmes sort behind the single-skill ones purely because they were added
 * to the catalogue later. Anything unrecognised follows, alphabetically.
 */
export function sortCourseCategories(categories: readonly string[]): string[] {
  const rank = (category: string) => {
    const index = (COURSE_CATEGORIES as readonly string[]).indexOf(category);
    return index === -1 ? COURSE_CATEGORIES.length : index;
  };
  return [...categories].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  );
}
