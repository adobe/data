# Agents

<!-- ecs-architecture:start -->
This app follows the `@adobe/ecs` architecture standard (`node_modules/@adobe/ecs-architecture/standard.md`).

- `src/<feature>/<layer>/`: layers `elements` (DOM only), `model` (headless), `ports` (outside sources) and `view`
  (rendering). `view` imports `model` and `elements`; `ports` imports `model`; `model` only `model`.
- Each layer is a component: `index.ts` re-exports one public declaration per root file, `<kind>.<name>.ts`; anything
  else is in a folder without an `index.ts`. Import a component only through its `index.ts`.
- Every `model` and `view` lists its systems in `constant.systems.ts`; an app adds them.
- After adding, moving or exporting anything, run `pnpm exec ecs-architecture check` and fix what it reports, then
  `pnpm exec ecs-architecture diagrams`.
<!-- ecs-architecture:end -->
