export const ENV = {
  appId: process.env.NEXT_PUBLIC_APP_ID ?? "blush-with-tee",
  /** Signs session tokens. Must be a long random value in every environment. */
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  /**
   * Where the admin dashboard is served.
   *
   * Separate from `siteUrl` because they are different origins: a link mailed
   * or texted to staff - a low-stock report, say - has to open on the app they
   * are signed in to, and a signed-out visitor to the public site cannot fetch
   * an internal file. Falls back to the public origin only so a single-origin
   * deployment needs no extra variable.
   */
  adminUrl: process.env.ADMIN_URL ?? process.env.NEXT_PUBLIC_ADMIN_URL ?? "",
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
  cloudinaryFolder: process.env.CLOUDINARY_FOLDER ?? "blush-with-tee",
};
