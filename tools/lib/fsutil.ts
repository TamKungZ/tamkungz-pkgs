import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

export function sha256(file: string): string {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

export function sameContent(a: string, b: string): boolean {
  if (fs.statSync(a).size !== fs.statSync(b).size) return false;
  return sha256(a) === sha256(b);
}

/** Every regular file below `dir`, as paths relative to `dir` (posix separators), sorted. */
export function walk(dir: string): string[] {
  const out: string[] = [];
  const visit = (rel: string) => {
    for (const ent of fs.readdirSync(path.join(dir, rel), { withFileTypes: true })) {
      const next = rel ? `${rel}/${ent.name}` : ent.name;
      if (ent.isDirectory()) visit(next);
      else if (ent.isFile()) out.push(next);
    }
  };
  if (fs.existsSync(dir)) visit("");
  return out.sort();
}

/** Throws if the tree contains symlinks, hard-to-audit device nodes etc. (zip/tar input is untrusted). */
export function assertPlainTree(dir: string): void {
  const visit = (d: string) => {
    for (const ent of fs.readdirSync(d, { withFileTypes: true })) {
      const full = path.join(d, ent.name);
      if (ent.isDirectory()) visit(full);
      else if (!ent.isFile()) throw new Error(`refusing non-regular file: ${full}`);
    }
  };
  visit(dir);
}

export function ensureDir(dir: string): void {
  fs.mkdirSync(dir, { recursive: true });
}

export function formatBytes(n: number): string {
  if (n >= 1024 ** 2) return `${(n / 1024 ** 2).toFixed(1)} MB`;
  if (n >= 1024) return `${(n / 1024).toFixed(1)} KB`;
  return `${n} B`;
}

/** A single path segment that is safe to use as a directory/file name. */
export const SAFE_SEGMENT = /^[A-Za-z0-9][A-Za-z0-9._+~-]*$/;
