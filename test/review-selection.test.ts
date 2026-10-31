import assert from "node:assert/strict";
import test from "node:test";
import { locateReviewSelection } from "../src/review-selection.js";
test("reader selection preserves exact source offsets including Unicode", () => {
  const source = "# Review\n\n✅ The worker MUST retry.";
  const range = locateReviewSelection(source, "worker MUST retry");
  assert.ok(range);
  assert.equal(source.slice(range.start, range.end), "worker MUST retry");
});
test("ambiguous and formatted selections never silently attach to another passage", () => {
  assert.equal(locateReviewSelection("retry and retry", "retry"), null);
  assert.equal(locateReviewSelection("The **worker** retries", "The worker retries"), null);
  assert.equal(locateReviewSelection("abc", " "), null);
});
