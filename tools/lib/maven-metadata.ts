/**
 * Merging maven-metadata.xml.
 *
 * Gradle/Maven write the metadata of the *local* publish only. Copying it over the repo's
 * copy would drop every older version from <versions>, so artifact-level metadata is merged
 * (union of versions). Version-level metadata (SNAPSHOTs) simply replaces the old one.
 */
import crypto from "node:crypto";
import fs from "node:fs";

const VERSION = /<version>\s*([^<\s]+)\s*<\/version>/g;

export function isArtifactLevel(xml: string): boolean {
  return /<versions>/.test(xml);
}

/** Compare version strings the way people expect: numeric parts numerically, qualifiers last-ish. */
export function compareVersions(a: string, b: string): number {
  const part = (s: string) => s.split(/[.\-+]/);
  const pa = part(a);
  const pb = part(b);
  for (let i = 0; i < Math.max(pa.length, pb.length); i++) {
    const x = pa[i];
    const y = pb[i];
    if (x === undefined) return /^\d+$/.test(y) ? -1 : 1; // 1.0 < 1.0.1, but 1.0 > 1.0-SNAPSHOT
    if (y === undefined) return /^\d+$/.test(x) ? 1 : -1;
    const nx = /^\d+$/.test(x);
    const ny = /^\d+$/.test(y);
    if (nx && ny) {
      if (Number(x) !== Number(y)) return Number(x) - Number(y);
    } else if (nx !== ny) {
      return nx ? 1 : -1;
    } else if (x !== y) {
      return x < y ? -1 : 1;
    }
  }
  return 0;
}

function versionsOf(xml: string): string[] {
  return [...xml.matchAll(VERSION)].map((m) => m[1]).filter((v, i, all) => all.indexOf(v) === i);
}

function timestamp(d = new Date()): string {
  return d.toISOString().replace(/\D/g, "").slice(0, 14);
}

/** Merge `incoming` into `existing` (both artifact-level). Uses `incoming` as the template. */
export function mergeArtifactMetadata(existing: string, incoming: string): string {
  const all = [...new Set([...versionsOf(existing), ...versionsOf(incoming)])].sort(compareVersions);
  const stable = all.filter((v) => !/snapshot/i.test(v));
  const latest = all.at(-1)!;
  const release = stable.at(-1);

  let xml = incoming.replace(/<versions>[\s\S]*?<\/versions>/, () => {
    const body = all.map((v) => `      <version>${v}</version>`).join("\n");
    return `<versions>\n${body}\n    </versions>`;
  });
  xml = xml.replace(/<latest>[^<]*<\/latest>/, `<latest>${latest}</latest>`);
  if (release) xml = xml.replace(/<release>[^<]*<\/release>/, `<release>${release}</release>`);
  xml = xml.replace(/<lastUpdated>[^<]*<\/lastUpdated>/, `<lastUpdated>${timestamp()}</lastUpdated>`);
  return xml;
}

const HASHES: Record<string, string> = { ".md5": "md5", ".sha1": "sha1", ".sha256": "sha256", ".sha512": "sha512" };

/** Rewrite the checksum files that sit next to `file`, and drop signatures that no longer match. */
export function refreshSidecars(file: string): void {
  const data = fs.readFileSync(file);
  for (const [suffix, algo] of Object.entries(HASHES)) {
    if (fs.existsSync(file + suffix)) {
      fs.writeFileSync(file + suffix, crypto.createHash(algo).update(data).digest("hex"));
    }
  }
  for (const stale of fs.readdirSync(file.replace(/[^/]+$/, "") || ".")) {
    const full = file.replace(/[^/]+$/, "") + stale;
    if (full.startsWith(file + ".asc")) fs.rmSync(full); // .asc, .asc.md5, .asc.sha1, ...
  }
}
