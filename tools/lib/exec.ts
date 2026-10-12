import { spawnSync, type SpawnSyncOptions } from "node:child_process";

export interface RunOptions extends SpawnSyncOptions {
  input?: string | Buffer;
}

/** Run a program (no shell) and return stdout. Throws with stderr on failure. */
export function run(cmd: string, args: string[], opts: RunOptions = {}): string {
  const r = spawnSync(cmd, args, { encoding: "utf8", maxBuffer: 256 * 1024 * 1024, ...opts });
  if (r.error) throw new Error(`${cmd}: ${r.error.message}`);
  if (r.status !== 0) {
    throw new Error(`${cmd} ${args.slice(0, 3).join(" ")} exited ${r.status}\n${String(r.stderr ?? "").trim()}`);
  }
  return String(r.stdout ?? "");
}

/** Like run(), but returns null instead of throwing. */
export function tryRun(cmd: string, args: string[], opts: RunOptions = {}): string | null {
  try {
    return run(cmd, args, opts);
  } catch {
    return null;
  }
}

export function hasCommand(cmd: string): boolean {
  return spawnSync(cmd, ["--version"], { stdio: "ignore" }).error === undefined;
}
