import fs from "node:fs";
import path from "node:path";
import { PACKAGES_DIR } from "./tree";

export interface MavenArtifact {
  name: string;
  groupId: string;
  artifactId: string;
  version: string;
  sourceUrl?: string;
}

function listPomFiles(directory: string, relative = ""): string[] {
  const current = path.join(directory, relative);
  return fs.readdirSync(current, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".")) return [];
    const child = path.join(relative, entry.name);
    return entry.isDirectory()
      ? listPomFiles(directory, child)
      : entry.name.endsWith(".pom")
        ? [child]
        : [];
  });
}

function tagValue(xml: string, tag: string): string | undefined {
  const project = xml.split(/<dependencies(?:\s|>)/, 1)[0];
  const match = project.match(new RegExp(`<${tag}>\\s*([^<]+?)\\s*</${tag}>`));
  return match?.[1].trim();
}

function sourceUrlOf(xml: string): string | undefined {
  const urls = [...xml.matchAll(/<(?:url|connection|developerConnection)>\s*([^<]+?)\s*<\/(?:url|connection|developerConnection)>/g)];
  for (const [, value] of urls) {
    const candidate = value.replace(/^scm:git:/, "").replace(/\.git$/, "");
    try {
      const url = new URL(candidate);
      if (url.protocol === "https:" && url.hostname === "github.com" && url.pathname.split("/").filter(Boolean).length >= 2) {
        return `${url.origin}${url.pathname.replace(/\/$/, "")}`;
      }
    } catch {
      continue;
    }
  }
  return undefined;
}

function versionRank(version: string): (number | string)[] {
  return version.split(/[.-]/).map((part) => (/^\d+$/.test(part) ? Number(part) : part.toLowerCase()));
}

function compareVersions(a: string, b: string): number {
  const left = versionRank(a);
  const right = versionRank(b);
  for (let i = 0; i < Math.max(left.length, right.length); i++) {
    const x = left[i];
    const y = right[i];
    if (x === undefined) return typeof y === "number" ? -1 : 1;
    if (y === undefined) return typeof x === "number" ? 1 : -1;
    if (x === y) continue;
    if (typeof x === "number" && typeof y === "number") return x - y;
    if (typeof x === "number") return 1;
    if (typeof y === "number") return -1;
    return x.localeCompare(y);
  }
  return 0;
}

function preferredVersion(relativePom: string, fallback: string): string {
  const parts = relativePom.split(path.sep);
  const metadataPath = path.join(PACKAGES_DIR, "maven", ...parts.slice(0, -2), "maven-metadata.xml");
  if (!fs.existsSync(metadataPath)) return fallback;
  const metadata = fs.readFileSync(metadataPath, "utf8");
  return tagValue(metadata, "release") ?? tagValue(metadata, "latest") ?? fallback;
}

/** Latest published coordinate for each Maven artifact, using POM metadata and repository paths. */
export function listMavenArtifacts(): MavenArtifact[] {
  const root = path.join(PACKAGES_DIR, "maven");
  if (!fs.existsSync(root)) return [];

  const artifacts = new Map<string, MavenArtifact>();
  for (const relativePom of listPomFiles(root)) {
    const parts = relativePom.split(path.sep);
    if (parts.length < 4) continue;
    const xml = fs.readFileSync(path.join(root, relativePom), "utf8");
    const groupId = tagValue(xml, "groupId") ?? parts.slice(0, -3).join(".");
    const artifactId = tagValue(xml, "artifactId") ?? parts.at(-3)!;
    const version = tagValue(xml, "version") ?? parts.at(-2)!;
    if (!groupId || !artifactId || !version) continue;

    const key = `${groupId}:${artifactId}`;
    const candidate: MavenArtifact = {
      name: tagValue(xml, "name") ?? artifactId,
      groupId,
      artifactId,
      version: preferredVersion(relativePom, version),
      sourceUrl: sourceUrlOf(xml),
    };
    const current = artifacts.get(key);
    if (!current || compareVersions(candidate.version, current.version) > 0) {
      artifacts.set(key, candidate);
    } else if (!current.sourceUrl && candidate.sourceUrl) {
      current.sourceUrl = candidate.sourceUrl;
    }
  }

  return [...artifacts.values()].sort((a, b) => a.name.localeCompare(b.name));
}
