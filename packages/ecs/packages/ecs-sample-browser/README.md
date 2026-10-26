# ECS samples

The sample browser: `pnpm dev` here serves every sample package beside this one from one dev server, with a tab for
each, and opens on the first. Each sample is a package named `ecs-*` whose page is its `src/index.html`; its tab here
is named by its folder (`index.html` lists them, and `browser.test.ts` checks the list against the folders).

The server's root is the folder of packages: this page is at `/ecs-sample-browser/` and frames each sample's at
`/<package>/src/`, cross-origin isolated for shared memory. A hash names a sample's tab, and what follows a `/` in it
is the sample's own: `#ecs-guide/1-resources` opens the guide at its chapter.

`pnpm build` writes the same layout to `dist`, with relative urls, so it works wherever it's served from; its `pages`
field publishes it to the site's `ecs/samples`. The build's root page opens the sample browser with the hash it's given.
Every page the build writes registers `isolation-worker.ts`, a service worker giving every response the headers that
isolate a page across origins, when the page isn't isolated, and loads again under it: so shared memory and the
samples' workers work on a host that can't send those headers, such as GitHub Pages (`publish.ts`). A page loaded past
the worker, as a hard reload does, loads again too, with a marker in its query that it takes off, and a page loaded
with it never loads again, so it can't loop.

The dev server optimizes, before the first page asks, the dependencies every sample's modules import, its workers'
among them, which a page's own scan doesn't reach: a dependency found late reloads the page mid-load. A build of the
ECS, or a change to its sources, reloads no page either (`package-updates.ts`): the next load reads the new files.

`browser.test.ts` checks the tabs against the folders; `dev.page.test.ts` starts the dev server on an empty cache of
dependencies and serves the guide without reloading; `site.page.test.ts` builds the samples and serves them without
those headers, as such a host does, in full Chromium, where each sample works.
