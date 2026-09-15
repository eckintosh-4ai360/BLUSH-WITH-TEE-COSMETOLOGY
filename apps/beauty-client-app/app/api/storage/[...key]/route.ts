import { storageAccessPolicy } from "@blush/api/storage-access";
import { createStorageProxyHandler } from "@blush/storage/proxy-route";

export const GET = createStorageProxyHandler(storageAccessPolicy);
