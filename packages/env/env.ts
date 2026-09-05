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
  /**
   * Groq, which serves the in-app assistant.
   *
   * Server-side only - the key is never sent to a browser, and every model
   * call goes through the API package so the assistant can only see what the
   * signed-in caller is allowed to see.
   */
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  /**
   * The model the assistant runs on. Overridable so the school can move to a
   * newer one without a code change; the default is the strongest tool-calling
   * model on Groq's catalogue.
   */
  groqModel: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
};
