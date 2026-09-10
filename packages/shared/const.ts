export const COOKIE_NAME = "app_session_id";
export const ONE_YEAR_MS = 1000 * 60 * 60 * 24 * 365;
export const AXIOS_TIMEOUT_MS = 30_000;
export const UNAUTHED_ERR_MSG = "Please sign in to continue.";
export const NOT_ADMIN_ERR_MSG = "You do not have permission to do that.";

// Default redirect path for unauthenticated visitors.
export const LOGIN_PATH = "/login";

// Categories used to organize the course catalogue.
export const COURSE_CATEGORIES = ["General", "Individual Courses"] as const;

export type CourseCategory = (typeof COURSE_CATEGORIES)[number];

export const DEFAULT_COURSE_CATEGORY: CourseCategory = "General";

// Sorts categories ensuring General appears first followed by individual courses.
export function sortCourseCategories(categories: readonly string[]): string[] {
  const rank = (category: string) => {
    const index = (COURSE_CATEGORIES as readonly string[]).indexOf(category);
    return index === -1 ? COURSE_CATEGORIES.length : index;
  };
  return [...categories].sort(
    (a, b) => rank(a) - rank(b) || a.localeCompare(b),
  );
}
