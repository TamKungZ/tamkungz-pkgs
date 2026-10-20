/**
 * Decides where a released file belongs inside packages/.
 *
 * The rules are by file type, so an upstream project only has to attach its build output to a
 * GitHub release - it never needs to know this repo's folder layout:
 *
 *   *.deb               -> apt/pool/main/<x>/<package>/
 *   *.rpm               -> rpm/<arch>/
 *   *.apk               -> apk/<arch>/
 *   *.xbps              -> xbps/<arch>/
 *   *.pkg.tar.zst|xz    -> arch/<arch>/
 *   <file>.asc | .sig   -> next to <file> (when <file> is in the same release)
 *   maven-repo*.zip     -> merged into maven/        (zip of build/maven-repo)
 *   winget-manifests*.zip -> merged into winget/manifests/  (zip of <Id>/<version>/*.yaml)
 *
 * Anything else (installers hosted on GitHub Releases, checksums, ...) is skipped and reported.
 */
import { SAFE_SEGMENT } from "./fsutil";

export type Kind = "deb" | "rpm" | "apk" | "xbps" | "pacman";
export type BundleKind = "maven" | "winget";

/** Reads package metadata from the file itself (needs dpkg-deb / rpm / tar). Null = unknown. */
export interface Probes {
  debPackage(file: string): string | null;
  rpmArch(file: string): string | null;
  apkArch(file: string): string | null;
}

export interface Context {
  probes: Probes;
  /** Existing architecture folders of a section, e.g. existing("rpm") -> ["x86_64", "aarch64"]. */
  existing(section: "rpm" | "xbps" | "arch"): string[];
}

export type Route =
  | { type: "file"; kind: Kind; dirs: string[] }
  | { type: "bundle"; kind: BundleKind }
  | { type: "sidecar"; base: string }
  | { type: "skip"; reason: string };

const ARCH = /^[a-z0-9_]+$/;

export function isSidecar(name: string): string | null {
  const m = /^(.+)\.(asc|sig)$/i.exec(name);
  return m ? m[1] : null;
}

export function bundleKindOf(name: string): BundleKind | null {
  if (/^maven-repo.*\.(zip|tar\.gz|tgz)$/i.test(name)) return "maven";
  if (/^winget-manifests.*\.(zip|tar\.gz|tgz)$/i.test(name)) return "winget";
  return null;
}

/** Debian pool prefix: "livedesk" -> "l", "libfoo" -> "libf". */
export function poolPrefix(pkg: string): string {
  return pkg.startsWith("lib") && pkg.length > 3 ? pkg.slice(0, 4) : pkg[0];
}

/** "noarch" / "any" packages go to every architecture folder that already exists. */
function fanOut(arch: string, universal: string, existing: string[]): string[] {
  if (arch !== universal) return [arch];
  return existing.length > 0 ? existing : ["x86_64"];
}

/** `file` is the release file name; `src` is where to read it from for probing (defaults to `file`). */
export function routeFile(file: string, ctx: Context, src: string = file): Route {
  const lower = file.toLowerCase();

  if (!SAFE_SEGMENT.test(file)) return { type: "skip", reason: "unsafe file name" };

  const bundle = bundleKindOf(file);
  if (bundle) return { type: "bundle", kind: bundle };

  const base = isSidecar(file);
  if (base) return { type: "sidecar", base };

  if (lower.endsWith(".deb")) {
    const fromName = file.split("_")[0].toLowerCase();
    const pkg = ctx.probes.debPackage(src) ?? fromName;
    if (!SAFE_SEGMENT.test(pkg)) return { type: "skip", reason: `bad deb package name "${pkg}"` };
    return { type: "file", kind: "deb", dirs: [`apt/pool/main/${poolPrefix(pkg)}/${pkg}`] };
  }

  if (lower.endsWith(".rpm")) {
    const arch = ctx.probes.rpmArch(src) ?? /\.([A-Za-z0-9_]+)\.rpm$/i.exec(file)?.[1]?.toLowerCase() ?? null;
    if (!arch || !ARCH.test(arch)) return { type: "skip", reason: "cannot determine rpm architecture" };
    return { type: "file", kind: "rpm", dirs: fanOut(arch, "noarch", ctx.existing("rpm")).map((a) => `rpm/${a}`) };
  }

  if (lower.endsWith(".apk")) {
    const arch = ctx.probes.apkArch(src);
    if (!arch || !ARCH.test(arch)) return { type: "skip", reason: "cannot determine apk architecture (.PKGINFO)" };
    return { type: "file", kind: "apk", dirs: [`apk/${arch}`] };
  }

  if (lower.endsWith(".xbps")) {
    const arch = /\.([A-Za-z0-9_]+)\.xbps$/i.exec(file)?.[1]?.toLowerCase() ?? null;
    if (!arch || !ARCH.test(arch)) return { type: "skip", reason: "cannot determine xbps architecture" };
    return { type: "file", kind: "xbps", dirs: fanOut(arch, "noarch", ctx.existing("xbps")).map((a) => `xbps/${a}`) };
  }

  if (/\.pkg\.tar\.(zst|xz)$/i.test(file)) {
    const arch = /-([a-z0-9_]+)\.pkg\.tar\.(zst|xz)$/i.exec(file)?.[1]?.toLowerCase() ?? null;
    if (!arch || !ARCH.test(arch)) return { type: "skip", reason: "cannot determine pacman architecture" };
    return { type: "file", kind: "pacman", dirs: fanOut(arch, "any", ctx.existing("arch")).map((a) => `arch/${a}`) };
  }

  return { type: "skip", reason: "not a recognised package type" };
}
