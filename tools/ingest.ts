/**
 * Put a folder of release files into packages/, sorted by type (see tools/lib/route.ts).
 *
 *   npm run ingest -- <dir> [--overwrite] [--dry-run]
 *
 * Existing files are never replaced silently: identical files are skipped, different ones
 * abort the run unless --overwrite is given (published versions should be immutable).
 */
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { MAX_FILE_BYTES } from "../publish.config";
import { run } from "./lib/exec";
import { assertPlainTree, ensureDir, formatBytes, sameContent, walk } from "./lib/fsutil";
import { isArtifactLevel, mergeArtifactMetadata, refreshSidecars } from "./lib/maven-metadata";
import { PACKAGES_DIR } from "./lib/paths";
import { systemProbes } from "./lib/probes";
import { bundleKindOf, routeFile, type BundleKind, type Context } from "./lib/route";

export interface Options {
  overwrite: boolean;
  dryRun: boolean;
  /** Where packages/ lives (tests point this at a temp dir). */
  target?: string;
  ctx?: Partial<Context>;
}

export interface Report {
  added: string[];
  replaced: string[];
  unchanged: string[];
  skipped: { file: string; reason: string }[];
  conflicts: string[];
}

const empty = (): Report => ({ added: [], replaced: [], unchanged: [], skipped: [], conflicts: [] });

/** Copy one file into place, honouring the overwrite policy. `rel` is relative to packages/. */
function place(src: string, rel: string, target: string, opts: Options, report: Report): void {
  const dest = path.join(target, rel);
  if (fs.existsSync(dest)) {
    if (sameContent(src, dest)) {
      report.unchanged.push(rel);
      return;
    }
    if (!opts.overwrite) {
      report.conflicts.push(rel);
      return;
    }
    report.replaced.push(rel);
  } else {
    report.added.push(rel);
  }
  if (opts.dryRun) return;
  ensureDir(path.dirname(dest));
  fs.copyFileSync(src, dest);
}

function extract(archive: string, into: string): void {
  ensureDir(into);
  if (/\.zip$/i.test(archive)) run("unzip", ["-q", "-o", archive, "-d", into]);
  else run("tar", ["-xzf", archive, "-C", into, "--no-same-owner", "--no-same-permissions"]);
  assertPlainTree(into); // untrusted archive: no symlinks / special files
}

/** Archive may wrap everything in one top-level folder (e.g. maven-repo/); unwrap it. */
function unwrap(dir: string, name: string): string {
  const entries = fs.readdirSync(dir);
  return entries.length === 1 && entries[0] === name && fs.statSync(path.join(dir, name)).isDirectory()
    ? path.join(dir, name)
    : dir;
}

function mergeBundle(kind: BundleKind, root: string, target: string, opts: Options, report: Report): void {
  if (kind === "winget") {
    const base = unwrap(root, "manifests");
    for (const rel of walk(base)) {
      if (!/\.ya?ml$/i.test(rel)) {
        report.skipped.push({ file: `winget/${rel}`, reason: "not a manifest (.yaml)" });
        continue;
      }
      if (!/^[^/]+\/[^/]+\/[^/]+\.ya?ml$/i.test(rel)) {
        report.skipped.push({ file: `winget/${rel}`, reason: "expected <PackageId>/<version>/<file>.yaml" });
        continue;
      }
      place(path.join(base, rel), `winget/manifests/${rel}`, target, opts, report);
    }
    return;
  }

  const base = unwrap(unwrap(root, "maven-repo"), "maven");
  const merged = new Set<string>(); // metadata files we merged: their checksums/signatures are regenerated
  for (const rel of walk(base)) {
    const name = path.posix.basename(rel);
    const src = path.join(base, rel);
    const dest = path.join(target, "maven", rel);

    if (name === "maven-metadata.xml" && fs.existsSync(dest)) {
      merged.add(dest);
      mergeMavenMetadata(src, dest, `maven/${rel}`, opts, report);
      continue;
    }
    if (/^maven-metadata\.xml\./.test(name) && merged.has(path.join(path.dirname(dest), "maven-metadata.xml"))) continue;
    place(src, `maven/${rel}`, target, opts, report);
  }
}

function mergeMavenMetadata(src: string, dest: string, rel: string, opts: Options, report: Report): void {
  const incoming = fs.readFileSync(src, "utf8");
  const existing = fs.readFileSync(dest, "utf8");
  const merged = isArtifactLevel(incoming) && isArtifactLevel(existing) ? mergeArtifactMetadata(existing, incoming) : incoming;
  const stable = (x: string) => x.replace(/<lastUpdated>[^<]*<\/lastUpdated>/, ""); // timestamp alone is not a change
  if (stable(merged) === stable(existing)) {
    report.unchanged.push(rel);
    return;
  }
  report.replaced.push(`${rel} (merged)`);
  if (opts.dryRun) return;
  fs.writeFileSync(dest, merged);
  refreshSidecars(dest);
}

export function ingest(inputDir: string, opts: Options): Report {
  const target = opts.target ?? PACKAGES_DIR;
  const report = empty();
  const ctx: Context = {
    probes: systemProbes,
    existing: (section) => {
      const dir = path.join(target, section);
      return fs.existsSync(dir) ? fs.readdirSync(dir).filter((n) => fs.statSync(path.join(dir, n)).isDirectory()) : [];
    },
    ...opts.ctx,
  };

  assertPlainTree(inputDir);
  const files = walk(inputDir);
  for (const rel of files) {
    const size = fs.statSync(path.join(inputDir, rel)).size;
    if (size > MAX_FILE_BYTES) throw new Error(`${rel} is ${formatBytes(size)}; limit is ${formatBytes(MAX_FILE_BYTES)}`);
  }

  const routed = new Map<string, string[]>(); // release file -> destination dirs
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), "ingest-"));

  try {
    // pass 1: primary files and bundles
    for (const rel of files) {
      const name = path.posix.basename(rel);
      const src = path.join(inputDir, rel);
      const r = routeFile(name, ctx, src);

      if (r.type === "file") {
        routed.set(name, r.dirs);
        for (const dir of r.dirs) place(src, `${dir}/${name}`, target, opts, report);
      } else if (r.type === "bundle") {
        const out = path.join(tmp, name);
        extract(src, out);
        mergeBundle(r.kind, out, target, opts, report);
      }
    }

    // pass 2: detached signatures follow their package
    for (const rel of files) {
      const name = path.posix.basename(rel);
      const r = routeFile(name, ctx, path.join(inputDir, rel));
      const src = path.join(inputDir, rel);
      if (r.type === "sidecar") {
        const dirs = routed.get(r.base);
        if (!dirs) report.skipped.push({ file: name, reason: `no matching package "${r.base}" in this release` });
        else for (const dir of dirs) place(src, `${dir}/${name}`, target, opts, report);
      } else if (r.type === "skip" && !bundleKindOf(name)) {
        report.skipped.push({ file: name, reason: r.reason });
      }
    }
  } finally {
    fs.rmSync(tmp, { recursive: true, force: true });
  }
  return report;
}

function printReport(r: Report, dryRun: boolean): string {
  const lines = [dryRun ? "## Ingest (dry run)" : "## Ingest", ""];
  const list = (title: string, items: string[]) => {
    if (items.length) lines.push(`**${title}** (${items.length})`, ...items.map((i) => `- \`${i}\``), "");
  };
  list("Added", r.added);
  list("Replaced", r.replaced);
  list("Unchanged", r.unchanged);
  if (r.skipped.length) lines.push(`**Skipped** (${r.skipped.length})`, ...r.skipped.map((s) => `- \`${s.file}\` - ${s.reason}`), "");
  list("CONFLICTS - already published with different content (use --overwrite)", r.conflicts);
  return lines.join("\n");
}

// --- CLI -------------------------------------------------------------------
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(import.meta.filename)) {
  const args = process.argv.slice(2);
  const flags = new Set(args.filter((a) => a.startsWith("--")));
  const dir = args.find((a) => !a.startsWith("--"));
  if (!dir || !fs.existsSync(dir)) {
    console.error("Usage: npm run ingest -- <dir> [--overwrite] [--dry-run]");
    process.exit(2);
  }

  const dryRun = flags.has("--dry-run");
  let report: Report;
  try {
    report = ingest(path.resolve(dir), { overwrite: flags.has("--overwrite"), dryRun });
  } catch (e) {
    console.error(`[ingest] ERROR: ${(e as Error).message}`);
    process.exit(1);
  }
  const text = printReport(report, dryRun);
  console.log(text);
  if (process.env.GITHUB_STEP_SUMMARY) fs.appendFileSync(process.env.GITHUB_STEP_SUMMARY, text + "\n");

  const changed = report.added.length + report.replaced.length;
  if (process.env.GITHUB_OUTPUT) fs.appendFileSync(process.env.GITHUB_OUTPUT, `changed=${changed > 0}\n`);
  if (report.conflicts.length) process.exit(1);
}
