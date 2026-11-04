# Configuration

Each part of the organization the checks read is a setting of `Config`, which `check(files, config)` and
`diagrams(files, config)` take, and the CLI reads from the app's `package.json` under `"ecsArchitecture"`. A setting
replaces its default, the standard's, which `defaults` holds:

- `layers`: each layer, by its folder's name, and the layers it may import. Here
  [`ui` may import `core`](03-configuration.ts#L16), and `core` only itself.
- `kinds`: the kinds a root file is named by, [`defaults.kinds` and `shader`](03-configuration.ts#L17) here.
- `apps`: the folders holding apps rather than features, [`demos`](03-configuration.ts#L18).
- `systems`: the layers that export `systems`, none here; `headless` the layers that run headless, `banned` the
  modules a layer may not import, and `source` the source folder.

With the standard's layers, this app's `core` and `ui` are components that aren't layers, `demos/` is a group of
features holding a file, and `shader.fill.ts` has no known kind. With its own, it breaks nothing, until `core`
[imports `ui`](03-configuration.ts#L28), above it, which also closes a cycle.
