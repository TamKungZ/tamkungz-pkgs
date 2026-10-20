/** Evaluated once per build, so every page shows the same timestamp. */
export const BUILT_AT = new Date().toISOString();
export const BUILT_DATE = BUILT_AT.slice(0, 10);
