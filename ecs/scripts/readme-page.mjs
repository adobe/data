// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// The site's root page, the repository's README rendered (see collect-pages.mjs). Its links reach what the site holds,
// relative to its root; a link or an image of what the site doesn't hold, such as a package's source, is shown as
// its text.

import { existsSync } from "node:fs";
import { join } from "node:path";
import { Marked } from "marked";

/** The site's root, where its page is, as a url its links resolve against; nothing is ever fetched from it. */
const root = new URL("https://site.invalid/root/");

/**
 * Whether a link's target is reachable from the site's root page: outside the site, as `https:`, or a file or folder
 * of the site, `site` the folder holding it, without its query or hash. A path leading with `/` is the host's, not the
 * site's, and a target that isn't a url isn't reachable.
 */
const reachable = (href, site) => {
  let target;
  let path;
  try {
    target = new URL(href, root);
    if (target.origin !== root.origin) return true;
    if (!target.pathname.startsWith(root.pathname)) return false;
    path = decodeURIComponent(target.pathname.slice(root.pathname.length));
  } catch {
    return false;
  }
  return path === "" || existsSync(join(site, path));
};

const escaped = (text) => text.replace(/[&<>"']/g, (character) => `&#${character.charCodeAt(0)};`);

/** The page for `readme`, the markdown of the README, in a site whose files are in the folder `site`. */
export const readmePage = (readme, site) => {
  const marked = new Marked({ renderer: {
    link(token) { return reachable(token.href, site) ? false : this.parser.parseInline(token.tokens); },
    image(token) { return reachable(token.href, site) ? false : escaped(token.text); },
  } });
  const title = /^# (.+)$/m.exec(readme)?.[1] ?? "ECS";
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escaped(title)}</title>
<link rel="icon" href="data:,">
<style>
  :root { color-scheme: light dark; --text: #1f2328; --muted: #59636e; --line: #d1d9e0; --code: #f6f8fa; --link: #0969da; --page: #fff; }
  @media (prefers-color-scheme: dark) { :root { --text: #e6edf3; --muted: #9198a1; --line: #3d444d; --code: #151b23; --link: #4493f8; --page: #0d1117; } }
  body { margin: 0; padding: 32px 16px; background: var(--page); color: var(--text); font: 16px/1.6 system-ui, sans-serif; }
  main { max-width: 860px; margin: 0 auto; }
  h1, h2 { border-bottom: 1px solid var(--line); padding-bottom: 0.3em; }
  a { color: var(--link); }
  img { max-width: 100%; }
  code { font: 85% ui-monospace, SFMono-Regular, Menlo, monospace; background: var(--code); padding: 0.2em 0.4em; border-radius: 6px; }
  pre { background: var(--code); padding: 16px; border-radius: 6px; overflow-x: auto; }
  pre code { padding: 0; background: none; }
</style>
</head>
<body>
<main>
${marked.parse(readme, { async: false })}
</main>
</body>
</html>
`;
};
