/** Turns a folder (as URL segments) into everything a listing page needs. */
import { homeBlocks, maven, type UsageBlock } from "../config/install";
import { PROJECT_ROOTS, SITE } from "../config/site";
import { kindOf, rowClass } from "./file-kind";
import { hasSection, listEntries, sectionOf } from "./tree";

export interface Row {
  kind: string;
  rowClass: string;
  /** Link text and href, e.g. "pool/" or "foo.deb". */
  label: string;
  size: string;
}

export interface PageMeta {
  title: string;
  description: string;
  /** "/" or "/apt/dists/". */
  pathText: string;
  siteName: string;
  usage: UsageBlock[] | null;
}

export function pathTextOf(segments: readonly string[]): string {
  return segments.length === 0 ? "/" : `/${segments.join("/")}/`;
}

export function canonicalUrl(pathText: string): string {
  return SITE.url + pathText;
}

export function formatSize(bytes: number): string {
  if (bytes >= 1024 ** 3) return `${(bytes / 1024 ** 3).toFixed(2)} GB`;
  if (bytes >= 1024 ** 2) return `${(bytes / 1024 ** 2).toFixed(2)} MB`;
  if (bytes >= 1024) return `${(bytes / 1024).toFixed(2)} KB`;
  return `${bytes.toLocaleString("en-US")} bytes`;
}

const DESCRIPTIONS: Record<string, string> = {
  apt: "APT repository shared by TamKungZ_ Linux packages.",
  rpm: "RPM repository shared by TamKungZ_ Linux packages.",
  apk: "Alpine APK repository shared by TamKungZ_ Linux packages.",
  xbps: "Signed Void XBPS repository shared by TamKungZ_ packages.",
  arch: "Arch Linux pacman repository shared by TamKungZ_ Linux packages.",
  winget:
    "Windows Package Manager manifest templates and related release metadata for TamKungZ_ Windows packages.",
};

export function getPageMeta(segments: readonly string[]): PageMeta {
  const pathText = pathTextOf(segments);
  const section = sectionOf(segments);

  if (section === "maven") {
    return {
      title: segments.length === 1 ? SITE.mavenName : `${SITE.mavenName} - ${pathText}`,
      description: `Browse Maven artifacts in ${pathText} from the ${SITE.mavenName}.`,
      pathText,
      siteName: SITE.mavenName,
      usage: [maven(`${SITE.url}/maven/`, "TamKungZ Maven")],
    };
  }

  if (segments.length === 0) {
    return {
      title: SITE.name,
      description:
        "Public package repository for TamKungZ_ projects, including APT, RPM, Alpine APK, " +
        "Void XBPS, Arch pacman repositories, release assets, signatures, and metadata.",
      pathText,
      siteName: SITE.name,
      usage: homeBlocks(SITE.url, hasSection("maven")),
    };
  }

  return {
    title: `${SITE.name} - ${pathText}`,
    description: DESCRIPTIONS[segments[0]] ?? `Browse public package files in ${pathText}.`,
    pathText,
    siteName: SITE.name,
    usage: null,
  };
}

export function getRows(segments: readonly string[]): Row[] {
  const section = sectionOf(segments);
  return listEntries(segments).map((entry) => {
    const kind = kindOf(entry.name, entry.isDir, section);
    return {
      kind,
      rowClass: rowClass(kind),
      label: entry.name + (entry.isDir ? "/" : ""),
      size: entry.isDir ? "" : formatSize(entry.size),
    };
  });
}

// --- sitemap ---------------------------------------------------------------

export function sitemapPriority(segments: readonly string[]): number {
  if (segments.length === 0) return 1.0;
  if ((PROJECT_ROOTS as readonly string[]).includes(segments[0])) return segments.length === 1 ? 0.75 : 0.45;
  return 0.3;
}

/** Home first, then repository sections in PROJECT_ROOTS order, then everything else. */
export function sitemapSortKey(segments: readonly string[]): [number, number, string] {
  const path = pathTextOf(segments);
  if (segments.length === 0) return [0, 0, path];
  const order = (PROJECT_ROOTS as readonly string[]).indexOf(segments[0]);
  return order >= 0 ? [1, order, path] : [2, 0, path];
}
