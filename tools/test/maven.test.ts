import assert from "node:assert/strict";
import { test } from "node:test";
import { isAllowedSource, isValidTag } from "../check-source";
import { compareVersions, mergeArtifactMetadata } from "../lib/maven-metadata";

const meta = (versions: string[], latest = versions.at(-1)) => `<?xml version="1.0" encoding="UTF-8"?>
<metadata>
  <groupId>me.tamkungz</groupId>
  <artifactId>sidegate</artifactId>
  <versioning>
    <latest>${latest}</latest>
    <release>${latest}</release>
    <versions>
${versions.map((v) => `      <version>${v}</version>`).join("\n")}
    </versions>
    <lastUpdated>20260101000000</lastUpdated>
  </versioning>
</metadata>
`;

test("version ordering", () => {
  const sorted = ["1.10.0", "1.2.0", "1.2.0-SNAPSHOT", "1.2.1", "2.0.0"].sort(compareVersions);
  assert.deepEqual(sorted, ["1.2.0-SNAPSHOT", "1.2.0", "1.2.1", "1.10.0", "2.0.0"]);
});

test("merging keeps old versions and updates latest/release", () => {
  const out = mergeArtifactMetadata(meta(["1.2.0", "1.2.1"]), meta(["1.3.0"]));
  assert.deepEqual([...out.matchAll(/<version>([^<]+)</g)].map((m) => m[1]), ["1.2.0", "1.2.1", "1.3.0"]);
  assert.match(out, /<latest>1\.3\.0<\/latest>/);
  assert.match(out, /<release>1\.3\.0<\/release>/);
  assert.doesNotMatch(out, /20260101000000/);
});

test("a SNAPSHOT never becomes <release>", () => {
  const out = mergeArtifactMetadata(meta(["1.0.0"]), meta(["1.1.0-SNAPSHOT"]));
  assert.match(out, /<latest>1\.1\.0-SNAPSHOT<\/latest>/);
  assert.match(out, /<release>1\.0\.0<\/release>/);
});

test("source allowlist", () => {
  const rules = ["TamKungZ/*", "other/one"];
  assert.ok(isAllowedSource("TamKungZ/livedesk", rules));
  assert.ok(isAllowedSource("tamkungz/LiveDesk", rules));
  assert.ok(isAllowedSource("other/one", rules));
  assert.ok(!isAllowedSource("other/two", rules));
  assert.ok(!isAllowedSource("evil/livedesk", rules));
  assert.ok(!isAllowedSource("TamKungZ/a b", rules));
  assert.ok(!isAllowedSource("TamKungZ/x;rm -rf /", rules));
  assert.ok(isValidTag("") && isValidTag("v1.2.3") && !isValidTag("v1; echo") && !isValidTag("-rf"));
});
