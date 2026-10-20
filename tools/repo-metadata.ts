/**
 * Build the release tree: packages/ -> build/stage/ + generated, signed repository metadata.
 *
 *   npm run repo:metadata          (CI; needs GPG and XBPS signing secrets in the env)
 *
 *   APT   dists/stable/...Packages(.gz), Release, InRelease, Release.gpg
 *   RPM   rpm/<arch>/repodata/ + repomd.xml.asc
 *   Arch  arch/<arch>/tamkungz.{db,files}(.tar.gz) + .sig
 *   Maven .asc (+ checksums) for artifacts that did not arrive signed; existing .asc kept
 *
 * The APK index is signed with its own key and copied through unchanged. XBPS indexes and
 * packages are signed with the dedicated XBPS RSA key.
 * packages/ itself is never modified.
 */
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
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

// --- XBPS ------------------------------------------------------------------

const XBPS_SIGNED_BY = "TamKungZ_ <dev@tamkungz.me>";

interface XbpsSigning {
  tempDir: string;
  privateKeyPath: string;
  publicKeyPath: string;
}

function hasXbpsPackages(root: string): boolean {
  return subdirs(root).some((arch) =>
    fs.readdirSync(path.join(root, arch)).some((name) => name.endsWith(".xbps")),
  );
}

function prepareXbpsSigning(): XbpsSigning | null {
  if (!hasXbpsPackages(path.join(PACKAGES_DIR, "xbps"))) {
    log("xbps: no .xbps files, signing preflight skipped");
    return null;
  }
  const privateKey = process.env.XBPS_PRIVATE_KEY;
  if (!privateKey?.trim()) throw new Error("XBPS_PRIVATE_KEY is not set - cannot sign XBPS repositories.");
  if (!hasCommand("openssl")) throw new Error("missing tool: openssl (required to verify the XBPS signing key).");
  if (!hasCommand("xbps-rindex")) throw new Error("missing tool: xbps-rindex (required to build signed XBPS repositories).");

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "xbps-sign-"));
  fs.chmodSync(tempDir, 0o700);
  const sourceKeyPath = path.join(tempDir, "source.pem");
  const privateKeyPath = path.join(tempDir, "private.pem");
  const publicKeyPath = path.join(tempDir, "tamkungz-void.pem.pub");
  const passphrase = process.env.XBPS_PASSPHRASE ?? "";
  const env = { ...process.env, XBPS_PASSPHRASE: passphrase };

  try {
    fs.writeFileSync(sourceKeyPath, privateKey, { mode: 0o600, flag: "wx" });
    const passIn = passphrase ? "env:XBPS_PASSPHRASE" : "pass:";
    run("openssl", ["rsa", "-in", sourceKeyPath, "-passin", passIn, "-check", "-noout"], { env });
    run("openssl", [
      "rsa", "-in", sourceKeyPath, "-passin", passIn,
      "-traditional", ...(passphrase ? ["-aes256", "-passout", "env:XBPS_PASSPHRASE"] : []),
      "-out", privateKeyPath,
    ], { env });
    fs.chmodSync(privateKeyPath, 0o600);
    run("openssl", ["rsa", "-in", privateKeyPath, "-passin", passIn, "-check", "-noout"], { env });
    run("openssl", [
      "rsa", "-in", privateKeyPath, "-passin", passIn, "-pubout", "-out", publicKeyPath,
    ], { env });
    fs.chmodSync(publicKeyPath, 0o644);

    const [arch, sourceDir] = subdirs(path.join(PACKAGES_DIR, "xbps"))
      .map((name) => [name, path.join(PACKAGES_DIR, "xbps", name)] as const)
      .find(([, dir]) => fs.readdirSync(dir).some((name) => name.endsWith(".xbps"))) ?? [];
    if (!arch || !sourceDir) throw new Error("XBPS packages disappeared during signing preflight.");
    const testDir = path.join(tempDir, "repository");
    fs.mkdirSync(testDir);
    const testPackageName = fs.readdirSync(sourceDir).find((name) => name.endsWith(".xbps"));
    if (!testPackageName) throw new Error("XBPS package disappeared during signing preflight.");
    const testPackage = path.join(testDir, testPackageName);
    fs.copyFileSync(path.join(sourceDir, testPackageName), testPackage);
    const xbpsEnv = { ...env, XBPS_ARCH: arch };
    run("xbps-rindex", ["--add", testPackage], { env: xbpsEnv });
    run("xbps-rindex", [
      "--privkey", privateKeyPath,
      "--signedby", XBPS_SIGNED_BY,
      "--sign", testDir,
    ], { env: xbpsEnv });
    run("xbps-rindex", [
      "--privkey", privateKeyPath, "--sign-pkg", testPackage,
    ], { env: xbpsEnv });
    if (!fs.existsSync(path.join(testDir, `${arch}-repodata`)) || !fs.existsSync(`${testPackage}.sig2`)) {
      throw new Error("XBPS signing preflight did not produce repository metadata and package signatures.");
    }
    run("openssl", [
      "dgst", "-sha256", "-verify", publicKeyPath, "-signature", `${testPackage}.sig2`, testPackage,
    ]);

    return { tempDir, privateKeyPath, publicKeyPath };
  } catch (error) {
    fs.rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

function buildXbps(stage: string, signing: XbpsSigning | null): void {
  const root = path.join(stage, "xbps");
  const arches = subdirs(root).filter((arch) =>
    fs.readdirSync(path.join(root, arch)).some((name) => name.endsWith(".xbps")),
  );
  if (arches.length === 0) return log("xbps: no .xbps files, skipped");
  if (!signing) throw new Error("xbps: signing key was not prepared before repository generation.");

  fs.copyFileSync(signing.publicKeyPath, path.join(root, "tamkungz-void.pem.pub"));
  for (const arch of arches) {
    const dir = path.join(root, arch);
    const packages = fs.readdirSync(dir)
      .filter((name) => name.endsWith(".xbps"))
      .sort()
      .map((name) => path.join(dir, name));
    const indexPath = path.join(dir, `${arch}-repodata`);

    fs.rmSync(indexPath, { force: true });
    fs.rmSync(`${indexPath}.sig2`, { force: true });

    const xbpsEnv = { ...process.env, XBPS_PASSPHRASE: process.env.XBPS_PASSPHRASE ?? "", XBPS_ARCH: arch };
    for (const pkg of packages) run("xbps-rindex", ["--add", pkg], { env: xbpsEnv });
    run("xbps-rindex", [
      "--privkey", signing.privateKeyPath,
      "--signedby", XBPS_SIGNED_BY,
      "--sign", dir,
    ], { env: xbpsEnv });
    for (const pkg of packages) {
      run("xbps-rindex", [
        "--privkey", signing.privateKeyPath, "--sign-pkg", pkg,
      ], { env: xbpsEnv });
      if (!fs.existsSync(`${pkg}.sig2`)) throw new Error(`xbps: signature was not created for ${path.basename(pkg)}.`);
      run("openssl", ["dgst", "-sha256", "-verify", path.join(root, "tamkungz-void.pem.pub"), "-signature", `${pkg}.sig2`, pkg]);
    }

    if (!fs.existsSync(indexPath)) throw new Error(`xbps: repository index was not created for ${arch}.`);
    log(`xbps: ${arch} (${packages.length} package(s)), repository and package signatures created`);
  }
}

// --- Maven -----------------------------------------------------------------

const SIGNABLE = /\.(jar|pom|module|aar|war)$|(^|\/)maven-metadata\.xml$/;
const HASHES: Record<string, string> = { ".md5": "md5", ".sha1": "sha1", ".sha256": "sha256", ".sha512": "sha512" };

/**
 * Artifacts that arrive already signed (from a Windows or Linux build machine) keep their .asc
 * untouched. Artifacts without one are signed here with the Linux key, and get the same checksum
 * files for the .asc as the artifact itself has.
 */
function buildMaven(stage: string, signer: Signer): void {
  const root = path.join(stage, "maven");
  let signed = 0;
  let kept = 0;
  for (const rel of walk(root)) {
    if (!SIGNABLE.test(rel)) continue;
    const file = path.join(root, rel);
    if (fs.existsSync(`${file}.asc`)) {
      kept++;
      continue;
    }
    signer.detach(file, `${file}.asc`, true);
    const asc = fs.readFileSync(`${file}.asc`);
    for (const [suffix, algo] of Object.entries(HASHES)) {
      if (fs.existsSync(file + suffix)) fs.writeFileSync(`${file}.asc${suffix}`, crypto.createHash(algo).update(asc).digest("hex"));
    }
    signed++;
  }
  if (signed + kept > 0) log(`maven: ${signed} signed here, ${kept} already signed (left as is)`);
}

// --- main ------------------------------------------------------------------

function main(): void {
  for (const tool of ["gpg", "dpkg-deb", "apt-ftparchive", "createrepo_c", "repo-add", "bsdtar"]) {
    if (!hasCommand(tool)) throw new Error(`missing tool: ${tool} (apt-get install apt-utils dpkg-dev createrepo-c pacman-package-manager libarchive-tools gnupg)`);
  }
  if (!fs.existsSync(PACKAGES_DIR)) throw new Error(`${PACKAGES_DIR} not found`);

  assertPlainTree(PACKAGES_DIR);
  const signer = Signer.fromEnv(SIGNING.linuxKeyEnv, SIGNING.passphraseEnv);
  let xbpsSigning: XbpsSigning | null = null;
  try {
    const published = publicFingerprints(path.join(PACKAGES_DIR, "gpg.key"));
    if (!published.includes(signer.fingerprint)) {
      throw new Error(
        `signing key ${signer.fingerprint} does not match packages/gpg.key (${published.join(", ") || "none"}). ` +
          "Update packages/gpg.key on purpose if you are rotating keys.",
      );
    }
    signer.selfTest();
    log(`gpg: secret key is usable and matches packages/gpg.key (${signer.fingerprint})`);

    xbpsSigning = prepareXbpsSigning();
    if (xbpsSigning) log("xbps: RSA private key is usable and its dedicated public key was generated");

    fs.rmSync(STAGE_DIR, { recursive: true, force: true });
    fs.cpSync(PACKAGES_DIR, STAGE_DIR, { recursive: true });
    log(`staged ${path.relative(process.cwd(), PACKAGES_DIR)}/ -> ${path.relative(process.cwd(), STAGE_DIR)}/`);

    buildApt(STAGE_DIR, signer);
    buildRpm(STAGE_DIR, signer);
    buildArch(STAGE_DIR, signer);
    buildXbps(STAGE_DIR, xbpsSigning);
    buildMaven(STAGE_DIR, signer);
  } finally {
    signer.dispose();
    if (xbpsSigning) fs.rmSync(xbpsSigning.tempDir, { recursive: true, force: true });
  }
  log("done");
}

try {
  main();
} catch (e) {
  console.error(`[repo] ERROR: ${(e as Error).message}`);
  process.exit(1);
}
