export const ENV = {
  appId: process.env.NEXT_PUBLIC_APP_ID ?? "blush-with-tee",
  // Secret key used to sign session tokens.
  cookieSecret: process.env.JWT_SECRET ?? "",
  databaseUrl: process.env.DATABASE_URL ?? "",
  isProduction: process.env.NODE_ENV === "production",
  siteUrl: process.env.NEXT_PUBLIC_SITE_URL ?? "",
  // Origin URL where the admin dashboard is hosted.
  adminUrl: process.env.ADMIN_URL ?? process.env.NEXT_PUBLIC_ADMIN_URL ?? "",
  cloudinaryCloudName: process.env.CLOUDINARY_CLOUD_NAME ?? "",
  cloudinaryApiKey: process.env.CLOUDINARY_API_KEY ?? "",
  cloudinaryApiSecret: process.env.CLOUDINARY_API_SECRET ?? "",
  cloudinaryFolder: process.env.CLOUDINARY_FOLDER ?? "blush-with-tee",
  // Server-side API key for Groq AI assistant.
  groqApiKey: process.env.GROQ_API_KEY ?? "",
  // LLM model identifier used by the AI assistant.
  groqModel: process.env.GROQ_MODEL ?? "openai/gpt-oss-120b",
};
