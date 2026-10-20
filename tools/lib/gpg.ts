/**
 * GPG signing with a private key taken from the environment.
 *
 * Safety notes (this repo is public, the key is a repository secret):
 *  - the key is imported into a throw-away GNUPGHOME (mode 700) and never touches ~/.gnupg
 *  - key and passphrase are passed via stdin / a 0600 file, never as command-line arguments
 *  - nothing here ever prints the key, the passphrase or the environment
 *  - dispose() stops the agent and deletes the keyring
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { run } from "./exec";

export class Signer {
  readonly fingerprint: string;
  private readonly home: string;
  private readonly passFile: string | null;

  private constructor(home: string, passFile: string | null, fingerprint: string) {
    this.home = home;
    this.passFile = passFile;
    this.fingerprint = fingerprint;
  }

  /** Reads `keyEnv` (armored key, or the same base64-encoded) and optional `passEnv`. */
  static fromEnv(keyEnv: string, passEnv: string): Signer {
    const raw = process.env[keyEnv];
    if (!raw?.trim()) throw new Error(`${keyEnv} is not set - cannot sign repository metadata.`);

    const key = raw.includes("BEGIN PGP") ? raw : Buffer.from(raw.trim(), "base64").toString("utf8");
    if (!key.includes("BEGIN PGP PRIVATE KEY")) throw new Error(`${keyEnv} does not contain an armored PGP private key.`);

    const home = fs.mkdtempSync(path.join(os.tmpdir(), "gnupg-"));
    fs.chmodSync(home, 0o700);

    try {
      let passFile: string | null = null;
      const pass = process.env[passEnv];
      if (pass) {
        passFile = path.join(home, ".pass");
        fs.writeFileSync(passFile, pass, { mode: 0o600 });
      }

      const gpg = (args: string[], input?: string) => run("gpg", ["--homedir", home, "--batch", "--no-tty", ...args], { input });
      gpg(["--pinentry-mode", "loopback", ...(passFile ? ["--passphrase-file", passFile] : []), "--import"], key);

      const colons = gpg(["--list-secret-keys", "--with-colons"]);
      const fpr = /^sec[^\n]*\n(?:[^\n]*\n)*?fpr:::::::::([0-9A-F]{40}):/m.exec(colons)?.[1];
      if (!fpr) throw new Error("Imported key has no usable secret key / fingerprint.");
      return new Signer(home, passFile, fpr);
    } catch (e) {
      fs.rmSync(home, { recursive: true, force: true });
      throw e;
    }
  }

  private gpg(args: string[]): void {
    run("gpg", [
      "--homedir", this.home, "--batch", "--yes", "--no-tty",
      "--pinentry-mode", "loopback",
      ...(this.passFile ? ["--passphrase-file", this.passFile] : []),
      "--local-user", this.fingerprint,
      ...args,
    ]);
  }

  /** InRelease style. */
  clearsign(file: string, out: string): void {
    this.gpg(["--clearsign", "-o", out, file]);
  }

  /** Detached signature: ASCII armored (.asc) or binary (.sig). */
  detach(file: string, out: string, armor: boolean): void {
    this.gpg([...(armor ? ["--armor"] : []), "--detach-sign", "-o", out, file]);
  }

  /** Prove that the imported key and configured passphrase can sign and verify data. */
  selfTest(): void {
    const file = path.join(this.home, ".signing-test");
    const signature = `${file}.sig`;
    try {
      fs.writeFileSync(file, "TamKungZ signing key self-test\n", { mode: 0o600, flag: "wx" });
      this.detach(file, signature, false);
      run("gpg", ["--homedir", this.home, "--batch", "--no-tty", "--verify", signature, file]);
    } finally {
      fs.rmSync(file, { force: true });
      fs.rmSync(signature, { force: true });
    }
  }

  dispose(): void {
    try {
      run("gpgconf", ["--homedir", this.home, "--kill", "gpg-agent"]);
    } catch {
      /* agent may not be running */
    }
    fs.rmSync(this.home, { recursive: true, force: true });
  }
}

/** Primary-key fingerprints inside a public key file. */
export function publicFingerprints(keyFile: string): string[] {
  const out = run("gpg", ["--batch", "--no-tty", "--show-keys", "--with-colons", keyFile]);
  const fprs: string[] = [];
  let afterPub = false;
  for (const line of out.split("\n")) {
    if (line.startsWith("pub:")) afterPub = true;
    else if (line.startsWith("sub:")) afterPub = false;
    else if (afterPub && line.startsWith("fpr:")) {
      fprs.push(line.split(":")[9]);
      afterPub = false;
    }
  }
  return fprs;
}
