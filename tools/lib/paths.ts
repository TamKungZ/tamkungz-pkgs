import path from "node:path";

/** Source of truth: only package files + public keys. Committed to git. */
export const PACKAGES_DIR = path.resolve(process.env.PACKAGES_DIR ?? "packages");

/** Release staging copy of packages/ plus generated + signed metadata. Never committed. */
export const STAGE_DIR = path.resolve(process.env.STAGE_DIR ?? "build/stage");
