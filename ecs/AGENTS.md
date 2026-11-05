# Agents

<!-- ecs-architecture:start -->
This app follows the `@adobe/ecs` architecture standard (`node_modules/@adobe/ecs-architecture/standard.md`).

- `src/<feature>/<layer>/`: layers `elements` (DOM only), `model` (headless), `ports` (outside sources) and `view`
  (rendering). `view` imports `model` and `elements`; `ports` imports `model`; `model` only `model`.
- Each layer is a component: `index.ts` re-exports one public declaration per root file, `<kind>.<name>.ts`; anything
  else is in a folder without an `index.ts`. Import a component only through its `index.ts`.
- One export per file, private folders (`shared/`, `systems/`) included: a component's file that exports is
  `<kind>.<name>.ts`, exporting `name` alone, first; give a function's types files of their own (`type.<name>.ts`).
- A test is named for the file it tests, beside it: `<file>.test.ts` (`<file>.browser.test.ts`); `index.test.ts` tests
  a component through its interface.
- Every `model` and `view` lists its systems in `constant.systems.ts`; an app adds them.
- After adding, moving or exporting anything, run `pnpm exec ecs-architecture check` and fix what it reports, then
  `pnpm exec ecs-architecture diagrams`.
<!-- ecs-architecture:end -->
