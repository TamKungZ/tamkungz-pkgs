import { tryRun } from "./exec";
import type { Probes } from "./route";

/** Real probes: ask dpkg-deb / rpm / tar. Missing tool or unreadable file -> null (filename rules apply). */
export const systemProbes: Probes = {
  debPackage: (file) => tryRun("dpkg-deb", ["-f", file, "Package"])?.trim() || null,

  rpmArch: (file) => tryRun("rpm", ["-qp", "--nosignature", "--qf", "%{ARCH}", file])?.trim() || null,

  apkArch(file) {
    const info = tryRun("tar", ["-xzOf", file, ".PKGINFO"]);
    return info ? (/^arch\s*=\s*(\S+)/m.exec(info)?.[1] ?? null) : null;
  },
};
