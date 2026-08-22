/**
 * The single central schema for the whole platform. The public website, the
 * admin system, and both portals all read and write these tables through one
 * API - there is no second database and no duplicated business data.
 *
 * Modules are ordered by dependency: identity first, then the domains that
 * reference it. Keep that order acyclic when adding tables.
 */
export * from "./enums";
export * from "./identity";
export * from "./academics";
export * from "./admissions";
export * from "./students";
export * from "./inventory";
export * from "./commerce";
export * from "./finance";
export * from "./staff";
export * from "./operations";
export * from "./cms";
