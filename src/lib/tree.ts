/**
 * Reads the `packages/` folder at build time.
 * Everything here is synchronous filesystem access; nothing runs in the browser.
 */
import fs from "node:fs";
import path from "node:path";
import { IGNORED_NAMES, MAVEN_FILE_SUFFIXES, PROJECT_ROOTS } from "../config/site";
import { suffixOf } from "./file-kind";

/**
 * Astro runs builds from the project root. (import.meta.url is unreliable once bundled.)
 * CI points PACKAGES_DIR at build/stage, the packages/ copy that already holds signed metadata.
 */
export const PACKAGES_DIR = path.resolve(process.cwd(), process.env.PACKAGES_DIR ?? "packages");

export type Section = "packages" | "maven";

export interface Entry {
  name: string;
  isDir: boolean;
  /** Bytes; 0 for directories. */
  size: number;
}

const byName = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0);

function isHidden(name: string): boolean {
  return name.startsWith(".") && name !== ".well-known";
}

function isSkipped(name: string): boolean {
  return isHidden(name) || IGNORED_NAMES.has(name);
}

export function sectionOf(segments: readonly string[]): Section {
  return segments[0] === "maven" ? "maven" : "packages";
}

export function dirOf(segments: readonly string[]): string {
  return path.join(PACKAGES_DIR, ...segments);
}

export function hasSection(name: string): boolean {
  return fs.existsSync(path.join(PACKAGES_DIR, name));
}

/** Generated repository metadata folders should remain accessible to package managers, but not
 * appear as HTML listing pages (which otherwise create dead links in crawlers / scanners).
 */
export function isGeneratedListingDir(name: string): boolean {
  return name === "repodata" || name === "dists";
}

function isDirectory(full: string): boolean {
  try {
    return fs.statSync(full).isDirectory();
  } catch {
    return false;
  }
}

/** Visible children of a folder: directories first, then files, each sorted by lowercase name. */
export function listEntries(segments: readonly string[]): Entry[] {
  const dir = dirOf(segments);
  const section = sectionOf(segments);
  const atRoot = segments.length === 0;

  const entries: Entry[] = [];
  for (const name of fs.readdirSync(dir)) {
    if (isSkipped(name)) continue;

    const full = path.join(dir, name);
    const isDir = isDirectory(full);

    if (isDir) {
      if (isGeneratedListingDir(name)) continue;
      // Only known repository folders are listed on the home page.
      if (atRoot && !(PROJECT_ROOTS as readonly string[]).includes(name)) continue;
    } else if (section === "maven" && !isMavenFile(name)) {
      continue;
    }

    entries.push({ name, isDir, size: isDir ? 0 : fs.statSync(full).size });
  }

  return entries.sort(
    (a, b) => Number(!a.isDir) - Number(!b.isDir) || byName(a.name.toLowerCase(), b.name.toLowerCase()),
  );
}

function isMavenFile(name: string): boolean {
  return name === "maven-metadata.xml" || MAVEN_FILE_SUFFIXES.has(suffixOf(name));
}

/** Every folder that gets a listing page, as URL segments. The home page is `[]`. */
export function listDirectories(): string[][] {
  const out: string[][] = [[]];

  const visit = (segments: string[]) => {
    for (const name of fs.readdirSync(dirOf(segments)).sort()) {
      if (isSkipped(name)) continue;
      if (isGeneratedListingDir(name)) continue;
      if (segments.length === 0 && !(PROJECT_ROOTS as readonly string[]).includes(name)) continue;
      if (!isDirectory(path.join(dirOf(segments), name))) continue;

      const child = [...segments, name];
      out.push(child);
      visit(child);
    }
  };

  visit([]);
  return out;
}
