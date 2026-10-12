/**
 * Build the release tree: packages/ -> build/stage/ + generated, signed repository metadata.
 *
 *   npm run repo:metadata          (CI; needs GPG_PRIVATE_LINUX [+ GPG_PASSPHRASE] in the env)
 *
 *   APT   dists/stable/...Packages(.gz), Release, InRelease, Release.gpg
 *   RPM   rpm/<arch>/repodata/ + repomd.xml.asc
 *   Arch  arch/<arch>/tamkungz.{db,files}(.tar.gz) + .sig
 *
 * APK and XBPS indexes are signed with their own (non-GPG) keys, so they are NOT generated here;
 * they are copied through untouched. packages/ itself is never modified.
 */
import fs from "node:fs";
import path from "node:path";
import zlib from "node:zlib";
import { APT, PACMAN_REPO, SIGNING } from "../publish.config";
import { hasCommand, run } from "./lib/exec";
import { assertPlainTree, walk } from "./lib/fsutil";
import { Signer, publicFingerprints } from "./lib/gpg";
import { PACKAGES_DIR, STAGE_DIR } from "./lib/paths";

const log = (msg: string) => console.log(`[repo] ${msg}`);

function subdirs(dir: string): string[] {
  return fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isDirectory()).sort() : [];
}

// --- APT -------------------------------------------------------------------

function buildApt(stage: string, signer: Signer): void {
  const aptDir = path.join(stage, "apt");
  const debs = walk(path.join(aptDir, "pool")).filter((f) => f.endsWith(".deb")).map((f) => `pool/${f}`);
  if (debs.length === 0) return log("apt: no .deb files, skipped");

  const suiteDir = path.join(aptDir, "dists", APT.suite);
  fs.rmSync(path.join(aptDir, "dists"), { recursive: true, force: true });

  const archOf = (deb: string) => run("dpkg-deb", ["-f", path.join(aptDir, deb), "Architecture"]).trim();
  const arches = [...new Set(debs.map(archOf).filter((a) => a !== "all"))].sort();
  if (arches.length === 0) throw new Error("apt: only Architecture: all packages found; need at least one real architecture.");

  // one complete index, then split per architecture ("all" goes into every one)
  const stanzas = run("apt-ftparchive", ["packages", "pool"], { cwd: aptDir })
    .split(/\n{2,}/)
    .map((s) => s.trim())
    .filter(Boolean);
  const archOfStanza = (s: string) => /^Architecture:\s*(\S+)/m.exec(s)?.[1] ?? "";

  for (const arch of arches) {
    const dir = path.join(suiteDir, APT.component, `binary-${arch}`);
    fs.mkdirSync(dir, { recursive: true });
    const text = stanzas.filter((s) => [arch, "all"].includes(archOfStanza(s))).join("\n\n") + "\n";
    fs.writeFileSync(path.join(dir, "Packages"), text);
    fs.writeFileSync(path.join(dir, "Packages.gz"), zlib.gzipSync(text, { level: 9 }));
  }

  // every .deb must be indexed, otherwise abort before anything is published
  for (const deb of debs) {
    const arch = archOf(deb);
    for (const a of arch === "all" ? arches : [arch]) {
      const index = fs.readFileSync(path.join(suiteDir, APT.component, `binary-${a}`, "Packages"), "utf8");
      if (!index.split("\n").includes(`Filename: ${deb}`)) throw new Error(`apt: ${deb} missing from binary-${a}/Packages`);
    }
  }

  const release = run("apt-ftparchive", [
    "-o", `APT::FTPArchive::Release::Origin=${APT.origin}`,
    "-o", `APT::FTPArchive::Release::Label=${APT.label}`,
    "-o", `APT::FTPArchive::Release::Suite=${APT.suite}`,
    "-o", `APT::FTPArchive::Release::Codename=${APT.suite}`,
    "-o", `APT::FTPArchive::Release::Architectures=${arches.join(" ")}`,
    "-o", `APT::FTPArchive::Release::Components=${APT.component}`,
    "-o", `APT::FTPArchive::Release::Description=${APT.description}`,
    "release", `dists/${APT.suite}`,
  ], { cwd: aptDir });
  const releaseFile = path.join(suiteDir, "Release");
  fs.writeFileSync(releaseFile, release);

  signer.clearsign(releaseFile, path.join(suiteDir, "InRelease"));
  signer.detach(releaseFile, path.join(suiteDir, "Release.gpg"), true);
  log(`apt: ${debs.length} package file(s), architectures: ${arches.join(", ")}`);
}

// --- RPM -------------------------------------------------------------------

function buildRpm(stage: string, signer: Signer): void {
  for (const arch of subdirs(path.join(stage, "rpm"))) {
    const dir = path.join(stage, "rpm", arch);
    if (!fs.readdirSync(dir).some((n) => n.endsWith(".rpm"))) continue;
    fs.rmSync(path.join(dir, "repodata"), { recursive: true, force: true });
    run("createrepo_c", ["--quiet", dir]);
    const repomd = path.join(dir, "repodata", "repomd.xml");
    signer.detach(repomd, `${repomd}.asc`, true);
    log(`rpm: ${arch} (${fs.readdirSync(dir).filter((n) => n.endsWith(".rpm")).length} rpm)`);
  }
}

// --- Arch ------------------------------------------------------------------

function buildArch(stage: string, signer: Signer): void {
  for (const arch of subdirs(path.join(stage, "arch"))) {
    const dir = path.join(stage, "arch", arch);
    const pkgs = fs.readdirSync(dir).filter((n) => /\.pkg\.tar\.(zst|xz)$/.test(n)).sort();
    if (pkgs.length === 0) continue;

    for (const n of fs.readdirSync(dir)) {
      if (n.startsWith(`${PACMAN_REPO}.db`) || n.startsWith(`${PACMAN_REPO}.files`)) fs.rmSync(path.join(dir, n), { force: true });
    }
    run("repo-add", ["--quiet", `${PACMAN_REPO}.db.tar.gz`, ...pkgs], { cwd: dir });

    // GitHub Pages has no symlinks: publish real copies under the names pacman asks for
    for (const kind of ["db", "files"]) {
      const tarball = path.join(dir, `${PACMAN_REPO}.${kind}.tar.gz`);
      const plain = path.join(dir, `${PACMAN_REPO}.${kind}`);
      fs.rmSync(plain, { force: true });
      fs.copyFileSync(tarball, plain);
      signer.detach(tarball, `${tarball}.sig`, false);
      fs.copyFileSync(`${tarball}.sig`, `${plain}.sig`);
    }
    log(`arch: ${arch} (${pkgs.length} package(s))`);
  }
}

// --- main ------------------------------------------------------------------

function main(): void {
  for (const tool of ["gpg", "dpkg-deb", "apt-ftparchive", "createrepo_c", "repo-add", "bsdtar"]) {
    if (!hasCommand(tool)) throw new Error(`missing tool: ${tool} (apt-get install apt-utils dpkg-dev createrepo-c pacman-package-manager libarchive-tools gnupg)`);
  }
  if (!fs.existsSync(PACKAGES_DIR)) throw new Error(`${PACKAGES_DIR} not found`);

  assertPlainTree(PACKAGES_DIR);
  fs.rmSync(STAGE_DIR, { recursive: true, force: true });
  fs.cpSync(PACKAGES_DIR, STAGE_DIR, { recursive: true });
  log(`staged ${path.relative(process.cwd(), PACKAGES_DIR)}/ -> ${path.relative(process.cwd(), STAGE_DIR)}/`);

  const signer = Signer.fromEnv(SIGNING.linuxKeyEnv, SIGNING.passphraseEnv);
  try {
    // The public key published at /gpg.key is what users trust. If the secret key is a
    // different one, every client would fail verification - so refuse to publish.
    const published = publicFingerprints(path.join(STAGE_DIR, "gpg.key"));
    if (!published.includes(signer.fingerprint)) {
      throw new Error(
        `signing key ${signer.fingerprint} does not match packages/gpg.key (${published.join(", ") || "none"}). ` +
          "Update packages/gpg.key on purpose if you are rotating keys.",
      );
    }
    buildApt(STAGE_DIR, signer);
    buildRpm(STAGE_DIR, signer);
    buildArch(STAGE_DIR, signer);
  } finally {
    signer.dispose();
  }
  log("done");
}

try {
  main();
} catch (e) {
  console.error(`[repo] ERROR: ${(e as Error).message}`);
  process.exit(1);
}
