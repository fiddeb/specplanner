import assert from "node:assert/strict";
import test from "node:test";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { MarkdownDocument } from "../src/markdown-document.js";

test("reader renders requirements, scenarios, tables and tasks without losing content", () => {
  const content = "# Requirements\n\n## Requirement: retries\n\nThe worker **MUST** retry at most `3` times.\n\n### Scenario: failure\n\n- Given a failed request\n- Then keep the original data\n\n| Limit | Value |\n| --- | --- |\n| Timeout | 30 seconds |\n\n- [x] Implemented\n- [ ] Verified\n";
  const html = renderToStaticMarkup(React.createElement(MarkdownDocument, { content }));
  assert.match(html, /<h1>Requirements<\/h1>/);
  assert.match(html, /<strong>MUST<\/strong>/);
  assert.match(html, /<code>3<\/code>/);
  assert.match(html, /<td>30 seconds<\/td>/);
  assert.match(html, /Then keep the original data/);
  assert.match(html, /aria-label="Incomplete task"/);
});
test("untrusted markdown cannot execute HTML or load remote images", () => {
  const content = '<script>alert(1)</script>\n\n[Run](javascript:alert%281%29)\n\n![Remote](https://example.com/track.png)\n\n[Reference](https://example.com/spec)';
  const html = renderToStaticMarkup(React.createElement(MarkdownDocument, { content }));
  assert.ok(!html.includes("<script"));
  assert.ok(!html.includes("<img"));
  assert.ok(!html.includes('href="javascript:'));
  assert.match(html, /&lt;script&gt;/);
  assert.match(html, /href="https:\/\/example.com\/spec"/);
});
