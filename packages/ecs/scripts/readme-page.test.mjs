// © 2026 Adobe. MIT License. See /LICENSE for details.
import assert from "node:assert/strict";
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";
import { readmePage } from "./readme-page.mjs";

/** A site holding `ecs/index.html` and `ecs/samples/logo.png`, the page rendered for `readme` in it. */
const rendered = (readme) => {
  const site = mkdtempSync(join(tmpdir(), "readme-page-"));
  try {
    mkdirSync(join(site, "ecs/samples"), { recursive: true });
    writeFileSync(join(site, "ecs/index.html"), "");
    writeFileSync(join(site, "ecs/samples/logo.png"), "");
    return readmePage(readme, site);
  } finally {
    rmSync(site, { recursive: true, force: true });
  }
};

test("links what the site holds and what's outside it, and shows the rest as their text", () => {
  const page = rendered([
    "# ECS",
    "[reference](ecs/) [search](ecs/?q=x) [section](ecs/#top) [here](#below) [web](https://example.com/a)",
    "[source](packages/ecs) [rooted](/ecs/) [broken](ecs/%E0%A4%A) [above](../ecs/)",
  ].join("\n\n"));
  for (const href of ["ecs/", "ecs/?q=x", "ecs/#top", "#below", "https://example.com/a"]) assert.ok(page.includes(`href="${href}"`), href);
  for (const text of ["source", "rooted", "broken", "above"]) {
    assert.ok(page.includes(text), text);
    assert.ok(!/href="(packages|\/ecs|ecs\/%E0|\.\.)/.test(page), text);
  }
});

test("shows an image the site holds, and only the text of one it doesn't", () => {
  const page = rendered("# ECS\n\n![logo](ecs/samples/logo.png) ![gone](packages/logo.png)");
  assert.ok(page.includes(`src="ecs/samples/logo.png"`));
  assert.ok(!page.includes(`src="packages/logo.png"`));
  assert.ok(page.includes("gone"));
});

test("escapes the title it takes from the README's heading", () => {
  assert.ok(rendered("# A <b> & \"c\"\n").includes("<title>A &#60;b&#62; &#38; &#34;c&#34;</title>"));
});
