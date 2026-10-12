/** Labels shown in the "type" column of listings. */
import type { Section } from "./tree";

/** All dot-suffixes: "x.tar.gz" -> [".tar", ".gz"]. Dotfiles and trailing dots have none. */
export function suffixesOf(name: string): string[] {
  if (name.endsWith(".")) return [];
  return name
    .replace(/^\.+/, "")
    .split(".")
    .slice(1)
    .map((s) => "." + s);
}

/** Last dot-suffix: "x.tar.gz" -> ".gz". */
export function suffixOf(name: string): string {
  return suffixesOf(name).at(-1) ?? "";
}

const CHECKSUM = new Set([".sha1", ".sha256", ".sha512", ".md5"]);

function mavenKind(name: string): string {
  const sfx = suffixOf(name.toLowerCase());
  if (sfx === ".jar") return "jar";
  if (sfx === ".pom") return "pom";
  if (sfx === ".module") return "module";
  if (CHECKSUM.has(sfx)) return "checksum";
  if (sfx === ".asc") return "signature";
  if (name === "maven-metadata.xml") return "metadata";
  return "file";
}

function packageKind(rawName: string): string {
  const name = rawName.toLowerCase();
  const sfx = suffixOf(name);
  const all = suffixesOf(name).join("");

  if (name === "gpg.key") return "gpg key";
  if (name.endsWith(".rsa.pub") || name.endsWith(".pem.pub") || sfx === ".pub") return "public key";
  if (name === "sha256sums") return "checksum";

  if (["inrelease", "release", "release.gpg"].includes(name)) return "apt metadata";
  if (name === "packages" || name === "packages.gz") return "apt index";
  if (name === "apkindex.tar.gz") return "apk index";
  if ([".db", ".db.tar.gz", ".files", ".files.tar.gz"].some((s) => name.endsWith(s))) return "pacman metadata";
  if (name === "repomd.xml" || name === "repomd.xml.asc") return "rpm metadata";

  if (sfx === ".rpm") return "rpm";
  if (sfx === ".deb") return "deb";
  if (sfx === ".apk") return "apk";
  if (sfx === ".xbps") return "xbps";
  if (all.endsWith(".pkg.tar.zst")) return "pacman package";
  if (sfx === ".snap") return "snap";
  if (sfx === ".flatpak") return "flatpak";
  if ([".tar.xz", ".tar.gz", ".tar.zst"].some((s) => all.endsWith(s))) return "archive";
  if (sfx === ".jar") return "jar";
  if (sfx === ".pom") return "pom";
  if (sfx === ".module") return "module";
  if (CHECKSUM.has(sfx)) return "checksum";
  if (sfx === ".asc" || sfx === ".sig") return "signature";
  if (name === "maven-metadata.xml") return "metadata";
  if (sfx === ".yaml" || sfx === ".yml") return "manifest";
  if ([".xml", ".gz", ".xz", ".zck", ".sqlite", ".solv"].includes(sfx)) return "metadata";

  return "file";
}

export function kindOf(name: string, isDir: boolean, section: Section): string {
  if (isDir) return "directory";
  return section === "maven" ? mavenKind(name) : packageKind(name);
}

/** CSS class for a row, e.g. "pacman package" -> "row-pacman-package". */
export function rowClass(kind: string): string {
  return "row-" + kind.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "");
}
