/// <reference types="vite/client" />

/** Build id baked in by vite.config.ts — compared against /version.json to
 * detect that the running bundle is stale. Undefined in dev. */
declare const __BUILD_ID__: string | undefined
