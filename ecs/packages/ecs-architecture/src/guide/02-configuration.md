# Configuration

Each part of the organization the check reads is a setting of `Config`, which `check(files, config)` takes, and the
CLI reads from the app's `package.json` under `"ecsArchitecture"`. A setting replaces its default, the standard's,
which `defaults` holds:

- `layers`: each layer, by its folder's name, and the layers it may import. Here
  [`ui` may import `core`](02-configuration.ts#L18), and `core` only itself.
- `kinds`: the kinds a root file is named by, [`defaults.kinds` and `shader`](02-configuration.ts#L19) here.
- `headless`: the layers that run headless, `banned`
  the modules a layer may not import, and `source` the source folder.

With the standard's layers, this app's `core` and `ui` are components that aren't layers, which leaves its features
with no layer, and `shader.fill.ts` has no known kind. With its own, it breaks nothing, until `core` [imports `ui`](02-configuration.ts#L28), above it, which also
closes a cycle.
