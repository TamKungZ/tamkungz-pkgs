import assert from "node:assert/strict";
import test from "node:test";
import { listAvailableApps } from "../../src/lib/available-apps";

test("valid WinGet manifests are detected and produce install commands", () => {
  const app = listAvailableApps("winget").find(({ id }) => id === "TamKungZ.ImageMerge");

  assert.deepEqual(
    { id: app?.id, name: app?.name, sourceUrl: app?.sourceUrl, installCommand: app?.installCommand },
    {
      id: "TamKungZ.ImageMerge",
      name: "ImageMerge",
      sourceUrl: "https://github.com/TamKungZ/ImageMergePy",
      installCommand: "winget install --id TamKungZ.ImageMerge -e --source tamkungz",
    },
  );
});

test("APT and WinGet ImageMerge packages share the same display name and source", () => {
  const aptApp = listAvailableApps("apt").find(({ id }) => id === "imagemerge");
  const wingetApp = listAvailableApps("winget").find(({ id }) => id === "TamKungZ.ImageMerge");

  assert.deepEqual(
    { name: aptApp?.name, sourceUrl: aptApp?.sourceUrl },
    { name: wingetApp?.name, sourceUrl: wingetApp?.sourceUrl },
  );
});

test("pacman install commands avoid partial system upgrades", () => {
  const app = listAvailableApps("arch").find(({ id }) => id === "tarminal");

  assert.equal(app?.installCommand, "sudo pacman -Syu --needed tarminal");
});

test("XBPS package files produce install commands", () => {
  const apps = listAvailableApps("xbps");
  const app = apps.find(({ id }) => id === "tarminal");

  assert.deepEqual(apps.map(({ id }) => id), ["tar-install", "tarminal"]);
  assert.equal(app?.installCommand, "sudo xbps-install tarminal");
});
