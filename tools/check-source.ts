/**
 * Gate for the publish workflow: is this upstream repo / tag allowed to publish here?
 *   SOURCE=owner/repo TAG=v1.2.3 npm run check:source
 * Values come from workflow inputs, so they are validated strictly before touching a shell.
 */
import { ALLOWED_SOURCES } from "../publish.config";

export function isAllowedSource(repo: string, allowed: readonly string[] = ALLOWED_SOURCES): boolean {
  if (!/^[A-Za-z0-9](?:[A-Za-z0-9-]{0,38})\/[A-Za-z0-9._-]{1,100}$/.test(repo)) return false;
  const [owner] = repo.split("/");
  return allowed.some((rule) => rule.toLowerCase() === repo.toLowerCase() || rule.toLowerCase() === `${owner.toLowerCase()}/*`);
}

export function isValidTag(tag: string): boolean {
  return tag === "" || /^[A-Za-z0-9][A-Za-z0-9._+-]{0,127}$/.test(tag);
}

if (process.argv[1] && import.meta.filename === process.argv[1]) {
  const repo = process.env.SOURCE ?? "";
  const tag = process.env.TAG ?? "";
  if (!isAllowedSource(repo)) {
    console.error(`"${repo}" is not allowed to publish. Add it to ALLOWED_SOURCES in publish.config.ts.`);
    process.exit(1);
  }
  if (!isValidTag(tag)) {
    console.error("Invalid release tag.");
    process.exit(1);
  }
  console.log(`ok: ${repo}${tag ? `@${tag}` : " (latest release)"}`);
}
