/**
 * Pipeline settings (not site settings - those live in src/config/site.ts).
 *
 * Read by tools/*.ts and by the GitHub workflows.
 */

/**
 * Upstream repositories allowed to publish into this site.
 *
 * Everything ingested here ends up in a repository that is SIGNED with our GPG key,
 * so this list is the trust boundary: anyone who can cut a release in a listed repo can
 * ship a package that users will install as "TamKungZ_". Keep it as narrow as you can.
 *
 *   "TamKungZ/*"          every repo of the account (default, easiest)
 *   "TamKungZ/livedesk"   one specific repo
 */
export const ALLOWED_SOURCES: readonly string[] = ["TamKungZ/*"];

/** GitHub rejects pushes with files over 100 MB; stay below it. */
export const MAX_FILE_BYTES = 95 * 1024 * 1024;

/** APT repository identity (goes into dists/stable/Release). */
export const APT = {
  suite: "stable",
  component: "main",
  origin: "TamKungZ_",
  label: "TamKungZ_ Packages",
  description: "TamKungZ_ APT Package Repository",
} as const;

/** Pacman repo name; clients see it as [tamkungz] with files tamkungz.db / tamkungz.files. */
export const PACMAN_REPO = "tamkungz";

/**
 * Names of the environment variables that carry the signing key.
 * In GitHub they are repository secrets with the same names (see .github/workflows/deploy.yml).
 */
export const SIGNING = {
  linuxKeyEnv: "GPG_PRIVATE_LINUX",
  passphraseEnv: "GPG_PASSPHRASE",
} as const;
