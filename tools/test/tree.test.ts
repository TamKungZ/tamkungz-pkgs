import assert from "node:assert/strict";
import test from "node:test";
import { isGeneratedListingDir } from "../../src/lib/tree";

test("generated repo metadata directories are hidden from HTML listings", () => {
  assert.equal(isGeneratedListingDir("repodata"), true);
  assert.equal(isGeneratedListingDir("dists"), true);
  assert.equal(isGeneratedListingDir("pool"), false);
  assert.equal(isGeneratedListingDir("x86_64"), false);
});
