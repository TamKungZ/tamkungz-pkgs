import fs from "node:fs";
import path from "node:path";
import { AUTHOR } from "../config/site";
import { PACKAGES_DIR } from "./tree";

export interface AvailableApp {
  id: string;
  name: string;
  sourceUrl: string;
  installCommand: string;
}

interface Installer {
  command: (id: string) => string;
  parseId: (relativePath: string, filename: string) => string | null;
  suffix: string;
}

const sources: Record<string, string> = {
  glosslate: "https://github.com/TamKungZ/Glosslate",
  livedesk: "https://github.com/TamKungZ/livedesk-live-wallpaper-for-gnome",
  "tar-install": "https://github.com/TamKungZ/tarminal-tar-install",
  tarminal: "https://github.com/TamKungZ/tarminal-tar-install",
  "TamKungZ.ImageMerge": "https://github.com/TamKungZ/ImageMergePy",
};

const installers: Record<string, Installer> = {
  apt: {
    suffix: ".deb",
    parseId: (relativePath) => {
      const parts = relativePath.split(path.sep);
      const pool = parts.indexOf("pool");
      return pool >= 0 && parts[pool + 1] === "main" ? parts[pool + 3] ?? null : null;
    },
    command: (id) => `sudo apt install ${id}`,
  },
  rpm: {
    suffix: ".rpm",
    parseId: (_relativePath, filename) => {
      const stem = filename.slice(0, -".rpm".length);
      return stem.match(/^(.+?)-(?=v?\d)/)?.[1] ?? null;
    },
    command: (id) => `sudo dnf install ${id}`,
  },
  apk: {
    suffix: ".apk",
    parseId: (_relativePath, filename) => filename.match(/^(.+?)-\d[^/]*-r\d+\.apk$/)?.[1] ?? null,
    command: (id) => `sudo apk add ${id}`,
  },
  xbps: {
    suffix: ".xbps",
    parseId: (_relativePath, filename) => filename.match(/^(.+?)-\d[^_]*_\d+\.[^.]+\.xbps$/)?.[1] ?? null,
    command: (id) => `sudo xbps-install ${id}`,
  },
  arch: {
    suffix: ".pkg.tar.zst",
    parseId: (_relativePath, filename) => {
      if (filename.includes("-debug-")) return null;
      return filename.match(/^(.+?)-\d[^-]*-\d+-[^-]+\.pkg\.tar\.zst$/)?.[1] ?? null;
    },
    command: (id) => `sudo pacman -S ${id}`,
  },
  winget: {
    suffix: ".yaml",
    parseId: (relativePath, filename) => {
      const parts = relativePath.split(path.sep);
      const id = parts[1];
      return parts[0] === "manifests" && filename === `${id}.yaml` ? id : null;
    },
    command: (id) => `winget install --id ${id} -e`,
  },
};

const displayNames: Record<string, string> = {
  glosslate: "Glosslate",
  livedesk: "Livedesk",
  "tar-install": "tar-install",
  tarminal: "Tarminal",
  "TamKungZ.ImageMerge": "ImageMerge",
};

function isPackageId(value: string): boolean {
  return /^[A-Za-z0-9][A-Za-z0-9._+-]*$/.test(value);
}

function collectFiles(root: string, relative = ""): string[] {
  const directory = path.join(root, relative);
  return fs.readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    if (entry.name.startsWith(".")) return [];
    const child = path.join(relative, entry.name);
    return entry.isDirectory() ? collectFiles(root, child) : [child];
  });
}

function isWingetManifest(relativePath: string): boolean {
  return relativePath.split(path.sep)[0] === "manifests";
}

/** Installable packages present in a package-manager root, deduplicated by package ID. */
export function listAvailableApps(rootName: string): AvailableApp[] {
  const installer = installers[rootName];
  if (!installer) return [];

  const root = path.join(PACKAGES_DIR, rootName);
  if (!fs.existsSync(root)) return [];

  const ids = new Set<string>();
  for (const relativePath of collectFiles(root)) {
    const filename = path.basename(relativePath);
    if (!filename.endsWith(installer.suffix)) continue;
    if (rootName === "winget" && !isWingetManifest(relativePath)) continue;

    const id = installer.parseId(relativePath, filename);
    if (!id || !isPackageId(id) || id.endsWith(".Example")) continue;
    ids.add(id);
  }

  return [...ids].sort((a, b) => a.localeCompare(b)).map((id) => ({
    id,
    name: displayNames[id] ?? displayNames[id.toLowerCase()] ?? id,
    sourceUrl: sources[id] ?? sources[id.toLowerCase()] ?? AUTHOR.githubUrl,
    installCommand: installer.command(id),
  }));
}
