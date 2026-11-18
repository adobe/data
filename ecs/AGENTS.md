# Agents

<!-- ecs-architecture:start -->
This app follows the `@adobe/ecs` architecture standard (`node_modules/@adobe/ecs-architecture/standard.md`).

- `src/` is the root feature. A feature holds layers `elements` (DOM only), `model` (headless), `ports`, `view`;
  sub-features in `features/`, which build on its layers; test features in `test/`. A parent imports its
  sub-features only in its plugins and indexes, to aggregate them.
- Each layer is a component: `index.ts` re-exports one public declaration per root file, `<kind>.<name>.ts`, which
  exports `name` alone, first; anything else is private. Import only through `index.ts`.
- A layer adding systems exports one plugin, `plugin.<feature>-<layer>.ts`; systems only it reaches are its parts, in
  `plugin.<feature>-<layer>/`. A declaration's parts are unexported in its file, or in a folder named for it when a
  test reaches them or the file passes 400 lines; `internal/` holds what several use; no other
  folders. Plugin names are unique.
- Only entries, `entry.<name>.ts`, run code as they load; the app is `features/main`, whose entries start
  every program; it may import any layer, and nothing imports it.
- A test sits beside what it tests and exports nothing; what tests share is a test feature, at the lowest feature
  whose tests share it.
- After adding, moving or exporting anything, run `pnpm exec ecs-architecture check` and fix what it reports.
<!-- ecs-architecture:end -->
