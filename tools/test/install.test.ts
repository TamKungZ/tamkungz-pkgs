import assert from "node:assert/strict";
import test from "node:test";
import { alpine, apt, homeBlocks, pacman } from "../../src/config/install";

test("APT install instructions use the signed repository without assuming an architecture", () => {
  const code = apt("https://packages.example.test");

  assert.match(code.code, /gpg --dearmor --yes/);
  assert.match(code.code, /chmod 0644 .*tamkungz-packages\.gpg/);
  assert.match(code.code, /signed-by=.*tamkungz-packages\.gpg/);
  assert.doesNotMatch(code.code, /arch=amd64,arm64/);
});

test("Alpine setup adds its architecture-specific repository only once", () => {
  const code = alpine("https://packages.example.test");

  assert.match(code.code, /apk\/\$\(apk --print-arch\)/);
  assert.match(code.code, /grep -qxF "\$repository"/);
});

test("pacman setup avoids duplicate repo entries and performs a full upgrade", () => {
  const code = pacman("https://packages.example.test");

  assert.match(code.code, /if ! grep -q/);
  assert.match(code.code, /pacman -Syu --needed/);
  assert.doesNotMatch(code.code, /pacman -Sy(?:\s|$)/);
});

test("home install examples omit repositories that are not install-ready", () => {
  const labels = homeBlocks("https://packages.example.test", true).map(({ label }) => label);

  assert.ok(labels.includes("Alpine APK"));
  assert.ok(labels.includes("Gradle"));
  assert.ok(!labels.some((label) => label.includes("XBPS")));
});
