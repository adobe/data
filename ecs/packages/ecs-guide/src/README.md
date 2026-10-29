# Guide

The ECS's guide, every example edited in place: as it's typed, TypeScript checks it, the ECS's build compiles it as
`Compiler.plugin()` does, and its program runs, showing what it logs and whether it finished or failed.

`pnpm dev` in this package serves it alone; `pnpm dev` in `ecs-sample-browser` serves it in the sample browser, as the
Guide tab. Each chapter has an address of its own, its numbered title's anchor, as GitHub makes it: `#1-resources`.

The chapters are read as the guide builds from `../ecs/src/guide`, where they stay: their order and parts from its
index, `README.md`, the unnumbered chapters first, and each chapter's prose, `NN-name.md`, its programs, `NN-name.ts`, and what they print,
`NN-name.out`. A link in the prose to a program's lines, `[text](01-resources.ts#L14-L23)`, which on GitHub opens the
file at them, shows them in the editor, selected; a link to a chapter's prose, `[text](15-reductions.md)`, opens that
chapter.

Each chapter shows its prose beside its example, which the reader edits in place. Its program runs again as the
reader types, once the code has been still for a moment, and the run's window under the editor shows it in four tabs:

- **Console:** what it logs, each line as node writes it, so it reads as the `.out` the prose shows: `log` and the
  other levels, `dir`, `table`, `assert`, `trace` and `count`. An error nothing caught, as a run left unawaited that
  rejects, is marked, and fails the run, as does a program that exports no `main`.
- **Output:** the frame the run renders into, whose `#output` fills it. A run that puts something there shows this tab,
  unless the reader picked a tab in its chapter: the UI chapters animate there, until the frame is replaced.
- **Problems:** TypeScript's errors and the ECS build's, listed together, each marked as whose it is, and marked in
  the editor.
- **Compiled:** what each system compiles to: its JS kernel, its WASM as WAT and its WGSL, each a tab of read-only
  code, or code it would compile to under a note of how, or why it gives none, with what runs it and where. Each
  system is a row whose backend badges are its tabs: choosing one expands the row at it, its code viewed only once
  shown, and its line link shows it in the editor.

Hovering code in the editor shows what TypeScript says of it: its type or signature, highlighted as the editor
highlights code, and its TSDoc, rendered, with its parameters, what it returns and its examples as sections; over a
problem, the problem shows with it, in the same tooltip. **Ctrl+K, then Ctrl+I** (Cmd on a Mac) shows the same at the
cursor, and Escape hides it. A splitter between the prose and the example resizes them side by side, by dragging it or
by the arrow keys once it has the focus, each keeping a least width; the guide remembers the width for the reader.
Stacked, on a narrow page, there's nothing to resize.

In the editor, a lens above each system's call says what it compiles to, `JS · WASM · WGSL`, a backend that only would
dimmed, or `as written`; hovering or focusing its chip shows what runs it and why a backend gives none, and choosing
it opens the system in the Compiled tab at the backend that runs it. While an edit doesn't compile, the lenses and the
tab keep the last build's, marked stale.

A loop or a recursion that never ends would freeze the page, since a run's frame shares its thread: each compiled
module, the ECS build's output, never its input or its kernels, checks the time at the start of every loop's body and
every function's (`compile/protect.ts`, `run/guard.ts`), and a task that runs for over a second throws, stopping the
run, shown in the Console, so the next edit runs. A check costs about 2.5 ns. A chapter shown again forgets its last
run, so it runs once, when its new revision compiles.

A tab not shown counts on a badge what's new there: lines logged since the Console last showed, marked when an error
is among them; Problems counts its problems always. The status says whether the run is running, finished or failed. A
link in the prose to a program's lines shows them in the editor, again each time it's followed; Reset example puts
the guide's code back. The
chapter on GPU kernels says whether the browser has WebGPU.

## How the page is driven

As in the todo sample, the guide's state is in its world, and its elements know nothing about the ECS: they take
properties and dispatch events. Each chapter is an entity: its prose, its files as the guide has them and as edited,
their revision, TypeScript's and the build's problems, its latest run and what it logged. Fixed elements are resources,
and so are the builds, a service that checks and compiles off the main thread and dispatches its results as events.

- **`chapters`**: the chapters from the guide, the one shown as the address says, the navigation and the prose.
- **`examples`**: each chapter's files, edited, reset and revealed at lines the prose links or a problem's; a chapter
  shown starts a new revision, so it runs again.
- **`builds`**: each revision sent to be checked and compiled, its results taken only while it's the latest, the run's
  console lines and end as its frame tells them, the tab each chapter shows and the lines seen there, what its systems compile to and the one
  opened, and the status, console, tabs, problems, compiled systems, editor marks and lenses, and frame bound to them.
- **`appearance`**: Spectrum's dark or light theme as the system prefers, which the page's markup reads before its
  first paint, and whether the browser has WebGPU. The page styles itself with Spectrum's tokens: the navigation, prose, editor and run window
  are rounded panels on the base background, a gutter apart, and the editor's colors are Spectrum's palette, whose
  tokens flip with the theme.

Each feature's `model.ts` holds systems with input, one per thing that happens, and `dom.ts` the readonly systems that
bind elements, with the ticking systems a feature needs, as one composite the app adds. `events.ts` turns DOM events,
the builds' results and the frame's messages into runs. Typing stays smooth: each keystroke is one run and the
bindings it changes, while checking, compiling and running happen in workers and the frame, after the code has been
still for 150 ms and 350 ms; a chapter's first build starts at once. A failure of TypeScript or the compiler
themselves, such as one that didn't load, is a problem of the chapter's, with the status saying so, and the next edit
tries again. A worker that fails to load, or fails as it runs, is started again by itself, a few times after a
short wait, the status saying it's retrying; only then is its failure a problem, saying what failed to load. Each
worker's entry (`workers/serve.ts`) loads its modules and says why when they fail. Both dev servers that serve the
guide optimize the workers' dependencies before the first page asks, so a first run never reloads the page, and
neither reloads it as the package is built again (`package-updates.ts`): its modules are invalidated, so the next load,
the workers' included, reads the new build, and the reader's edits stay.

## How an example runs

- **Checking**: TypeScript's language service, in a worker (`workers/typescript.ts`, `check/language-service.ts`),
  over the chapter's files with the package's declarations from `../ecs/dist`, the standard library's and WebGPU's.
  The same service says what's at a place for a hover (`getQuickInfoAtPosition`), over the files as the editor has
  them, the text it checks being the text it shows, so their positions are the same: one asked at a time, and only the
  newest answered (`latestAnswer` in `compile/latest.ts`).
- **Compiling**: the ECS's compiler, in a worker (`workers/compiler.ts`, `compile/compile-run.ts`), with oxc's WASM
  parser and transformer, from the package's files held in memory (`compile/package-files.ts`). The examples compile at
  their place in the package's sources, `src/guide`, as the package's own tests do, so their ids name the package.
  Each kernel's module is inlined as a `data:` url, which loads in the world's workers wherever they're served from.
- **Running**: each run is a fresh frame, so it has a registry of its own, and disposing the frame disposes its worlds
  and workers. The compiler's worker compiles one run at a time, the newest asked for, and puts the run's files in a
  cache, in a folder of the page's own, which the service worker drops once its page is gone (`compile/run-files.ts`):
  its page, whose import map sends `@adobe/ecs` and the hooks compiled code imports to one exports module, and the
  compiled modules; the page's `#output` fills its frame, for a program to render into, and the frame says when
  something is first put there. The service worker (`service-worker.ts`) serves them, and gives every response in its scope the headers that
  isolate a page across origins, so shared memory and the world's workers work on a host that can't send them. The
  frame loads the runtime (`run/runtime.ts`): the package, the hooks, and `start` (`run/program.ts`), which loads the
  run's modules and awaits each one's `main`, telling the page what the console takes, each turn's lines together,
  written as node writes values (`run/inspect.ts`), and how the run ended (`run/protocol.ts`).

## The package's internals

Samples import only `@adobe/ecs` and `@adobe/ecs/compiler`. The guide is the one exception, since it runs the build in
the browser, which no export offers. What it depends on of the package's insides, each a change there could break:

- `workers/compiler.ts` and `compile/compile-run.ts` import the compiler's core from
  `../ecs/src/implementation/compiler`: `memory-compiler.ts`, `oxc.ts`, and `inline-kernels.ts`, the plugin's own
  inlining of kernels as `data:` urls. `compile-run.ts` asks the memory compiler to describe each system as it
  compiles (`describe.ts`): its call's place, what runs it and where, and its JS kernel, its WASM as WAT (`wat.ts`)
  and its WGSL, or why each isn't made; each compile reply carries them, by file, for the page.
- `run/runtime.ts` imports the hooks compiled code imports, `attach-kernel.js`, `prepared-spawn.js` and
  `prepared-lookup.js`, from `../ecs/dist/implementation/world`: the same files `@adobe/ecs` resolves to, so they
  share its registry. `compile/run-files.ts` names the same hooks' paths in the package's build, which the compiler
  writes in compiled code, for each run's import map.
- `compile/package-files.ts` reads the package's sources' root and interface, `src/index.ts` and `src/interface`, and
  the same in its build, `dist`: what the build reads types from and kernels inline from, for anything an example can
  import. `check/language-service.ts` reads the build's declarations. Both keep only what the package ships, by its
  package.json's `files`.
- `compile/run-files.ts` compiles each example at its place in the package's sources, `src/guide`, as the package's
  own tests are, so its keys' and systems' ids name the package, as `18-identity.test.ts` checks.

The editor shows each example importing the package as `@adobe/ecs`, as a consumer does, where its file imports the
package's sources' root as `../index.js` (`content/guide.ts`); both resolve to the package where the guide compiles
it, so the file is otherwise the same, line for line.

## Tests

- `*.test.ts`, in node: the chapters read from the guide, with what each prints; the console's writing of values
  against node's own; the frame's lines and messages; a run's files; every chapter compiled and checked without a
  diagnostic, an edit the build rejects or TypeScript doesn't accept reported at its place, and the type-test chapter's
  error as it says. `build.test.ts`: the page builds, with its workers and WASM.
- `features/model.test.ts`, in node: the features' systems against a world: chapters shown by address, edits and
  resets as revisions, lines revealed, and results taken only for the latest revision, a run's console to its end, an
  error nothing caught failing it, and the tab shown, the Console's lines seen while it shows.
- `*.page.test.ts`: the built guide in full Chromium, served with the isolation headers: every chapter's program
  finishes in a frame that's cross-origin isolated, printing its `.out`, with no console error; an edit runs again
  with new output and resets; a run left unawaited that rejects is marked in the console and fails the run; the
  Console's tab counts what's logged while another shows, marked for errors; a loop, a recursion and a system's body
  that never end stop their runs, the page answering and the next edit running; a chapter shown again runs once; a
  program without `main` fails; the theme is the system's before the page's code runs; the editor shows Spectrum's
  focus indicator and line numbers at 4.5:1; the example's file tabs mark the file shown and take the keyboard; the UI chapters animate in the Output tab
  each frame, and stop as their frame is replaced; a type error shows TypeScript's problem
  and mark; chapter 14's lenses at each system with what it compiles to, a tooltip saying why, a lens opening its
  system in the Compiled tab by click or keyboard at its WASM, `kernel: false` making one as written, and a failing
  edit leaving them stale (`app/compiled.page.test.ts`), and chapter 16's GPU kernel opening at its WGSL, a system's badges selecting its backend; the editor's tooltips of
  TypeScript's and the build's problems at 4.5:1 in both schemes (`app/tooltips.page.test.ts`); the navigation and the
  prose scrolling to their ends inside their panels by the wheel, and the prose by Page Down (`app/scroll.page.test.ts`);
  hovering a call, a key and a local showing their types, `System.create`'s TSDoc as its reference publishes it, at
  4.5:1 in both schemes, only the newest hover answered, a problem and a type in one tooltip, and the keyboard's
  (`app/hover.page.test.ts`); the splitter beside the prose dragged and keyed within its least widths, kept for the
  reader, and absent when stacked (`app/resizer.page.test.ts`); and an async body the ECS build's; a link to lines, followed
  once and again, and a file's tab show their code; the dark color scheme, and the WebGPU note; Setup's code whole, with no sideways scroll, from a phone's
  width up; the compiler's WASM and TypeScript's worker failing to load, shown as problems, and the compiler loaded
  again for the next edit. `app/tabs.page.test.ts`: two tabs editing at once each run their own examples, and a closed
  tab's runs leave the cache. `app/dev.page.test.ts`: the guide's own dev server, started on an empty cache of
  dependencies, serves it without reloading, its program finishing. The compiler's worker failing to load is started
  again by itself, and gives the module that failed once its retries do.
