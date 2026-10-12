import assert from "node:assert/strict";
import test from "node:test";
import { listMavenArtifacts } from "../../src/lib/maven-catalog";

test("Maven selector lists published artifacts at their latest version", () => {
  const artifacts = listMavenArtifacts();
  const nilkit = artifacts.find((artifact) => artifact.artifactId === "nilkit");

  assert.ok(artifacts.length > 0);
  assert.deepEqual(
    {
      groupId: nilkit?.groupId,
      version: nilkit?.version,
      sourceUrl: nilkit?.sourceUrl,
    },
    {
      groupId: "me.tamkungz.nilkit",
      version: "4.1.0",
      sourceUrl: "https://github.com/NilKitAPI/NilKit-API",
    },
  );
  assert.equal(artifacts.filter((artifact) => artifact.artifactId === "nilkit").length, 1);
});
