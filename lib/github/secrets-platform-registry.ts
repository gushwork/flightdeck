import type { GHPlatformFetcher } from "./secrets-types";

/** Platform fetchers register here; indexer schedules their tasks via parallelPool. */
export const PLATFORM_FETCHERS: GHPlatformFetcher[] = [];
