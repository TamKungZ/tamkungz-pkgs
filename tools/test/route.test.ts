import assert from "node:assert/strict";
import { test } from "node:test";
import { bundleKindOf, poolPrefix, routeFile, type Context } from "../lib/route";

const none = { debPackage: () => null, rpmArch: () => null, apkArch: () => null };
const ctx = (over: Partial<Context> = {}): Context => ({ probes: none, existing: () => [], ...over });

test("deb: package name from metadata beats the file name", () => {
  const r = routeFile("Glosslate-v1.0.0-linux-x64.deb", ctx({ probes: { ...none, debPackage: () => "glosslate" } }));
  assert.deepEqual(r, { type: "file", kind: "deb", dirs: ["apt/pool/main/g/glosslate"] });
});

test("deb: falls back to the file name, lib* packages use 4-letter prefix", () => {
  assert.deepEqual(routeFile("livedesk_1.0.0_amd64.deb", ctx()), { type: "file", kind: "deb", dirs: ["apt/pool/main/l/livedesk"] });
  assert.equal(poolPrefix("libfoo"), "libf");
  assert.equal(poolPrefix("lib"), "l");
});

test("rpm / xbps / pacman architectures", () => {
  assert.deepEqual(routeFile("livedesk-1.0.0-1.aarch64.rpm", ctx()), { type: "file", kind: "rpm", dirs: ["rpm/aarch64"] });
  assert.deepEqual(routeFile("tarminal-0.2.0_1.x86_64.xbps", ctx()), { type: "file", kind: "xbps", dirs: ["xbps/x86_64"] });
  assert.deepEqual(routeFile("tarminal-0.2.0-0-x86_64.pkg.tar.zst", ctx()), { type: "file", kind: "pacman", dirs: ["arch/x86_64"] });
});

test("noarch / any fan out to existing architecture folders", () => {
  const c = ctx({ existing: () => ["x86_64", "aarch64"] });
  assert.deepEqual(routeFile("x-1-1.noarch.rpm", c), { type: "file", kind: "rpm", dirs: ["rpm/x86_64", "rpm/aarch64"] });
  assert.deepEqual(routeFile("x-1-1-any.pkg.tar.zst", c), { type: "file", kind: "pacman", dirs: ["arch/x86_64", "arch/aarch64"] });
  assert.deepEqual(routeFile("x-1-1.noarch.rpm", ctx()), { type: "file", kind: "rpm", dirs: ["rpm/x86_64"] });
});

test("apk needs the .PKGINFO probe", () => {
  assert.equal(routeFile("tarminal-0.2.0-r0.apk", ctx()).type, "skip");
  assert.deepEqual(routeFile("tarminal-0.2.0-r0.apk", ctx({ probes: { ...none, apkArch: () => "aarch64" } })), { type: "file", kind: "apk", dirs: ["apk/aarch64"] });
});

test("signatures, bundles and unknown files", () => {
  assert.deepEqual(routeFile("a_1_amd64.deb.asc", ctx()), { type: "sidecar", base: "a_1_amd64.deb" });
  assert.equal(bundleKindOf("maven-repo.zip"), "maven");
  assert.equal(bundleKindOf("winget-manifests-1.2.tar.gz"), "winget");
  assert.equal(routeFile("setup.msi", ctx()).type, "skip");
  assert.equal(routeFile("SHA256SUMS", ctx()).type, "skip");
});

test("hostile values never become paths", () => {
  assert.equal(routeFile("../evil.deb", ctx()).type, "skip");
  assert.equal(routeFile(".hidden.deb", ctx()).type, "skip");
  assert.equal(routeFile("a.deb", ctx({ probes: { ...none, debPackage: () => "../../etc" } })).type, "skip");
  assert.equal(routeFile("a.rpm", ctx({ probes: { ...none, rpmArch: () => "../x" } })).type, "skip");
});
