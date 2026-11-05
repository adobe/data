# The architecture standard

How an application on `@adobe/ecs` organizes its source. `ecs-architecture check` enforces each rule marked
(check); each violation it reports says how to fix it.

## Features, layers, components

```
src/
  index.ts          the app's entry points, re-exported; importing it has no side effects
  <app>/            an app, sample or benchmark (app/, apps/, samples/, perftest/): puts features together
  <feature>/        a vertical slice, holding only layer folders; a group of features holds only features
    elements/       custom elements that know nothing of the ECS: the DOM only
    model/          data, rules and systems that make sense headless: what's persisted and inspected
    ports/          glue to outside sources independent of this feature's markup: device input, network, storage, timers
    view/           systems that render the model, binding the DOM or drawing on the GPU, and connect this feature's widgets
```

A *feature* is a vertical slice; each *layer* is a *component*: a folder with an `index.ts` and a `README.md`, whose
exports are its public API and nothing else. The rule is recursive: a layer made of parts holds each part as a component
of its own. Every layer is optional, but a feature's components are always its layers. (check)

Layers by what they depend on, `elements` ← `view` → `model` ← `ports`:

| Layer | May import | May not |
|---|---|---|
| `elements` | `elements` | any `@adobe/*`: plain custom elements, properties in, DOM events out |
| `model` | `model` | the DOM, network, timers, `globalThis`, `Date.now`, `performance.now`, `@adobe/ecs-gpu`, UI libraries |
| `ports` | `model`, `ports` | `@adobe/ecs-gpu`; a widget's selectors: it's handed its targets and predicates |
| `view` | `model`, `elements`, `view` | `ports`, which never imports `view` either |

The model runs headless, and a test drives it through its public systems; time is the `clock` resource. Features form
a directed acyclic graph: a feature may extend another through its public interface. A feature is about its own
subject only: input-device code doesn't belong in a rendering feature. (check)

Which layer? Model, if a headless run would care: the selected tool, the selection. View state, a dialog open or a
panel collapsed, belongs to the view. A widget's meaning, a click on a tool button, is the view's; a raw stream, pointer
or keys, is a port's.

## What is public

- **Public declarations live at a component's root, one per file, named `<kind>.<name>.ts`**, `<name>` kebab-case and
  the file named for its export: `component.todo-title.ts` exports `todoTitle`. Kinds: `type`, `constant`, `component`,
  `resource`, `archetype`, `index`, `function`, `system`, `rule`, `finalizer`, `element`. (check)
- **A root file's export is its first declaration and its only export.** After the imports come its doc comment and the
  one `export`, typed as its interface (`export const clearCompleted: System = System.create(...)`); what it needs comes
  beneath it. Only what the export's statement needs as the module loads, such as an `Index` its declaration names, may
  sit above it. (check)
- **A system is typed `System`**, with type arguments only for its input and result: `System<{ readonly amount: number }, Entity>`,
  `void` for no input. (check)
- **Anything else is private:** a folder with no `index.ts`, such as `shared/` or `systems/`, or named for what it
  holds. Shared private code sits at the lowest common ancestor of its users; if something outside needs it, it becomes
  a public component.
- **Every file of a component that exports is a declaration file,** in a private folder as at its root: named
  `<kind>.<name>.ts`, exporting `name` alone, first. A function and the types it takes are files of their own:
  `function.parse-todo.ts` beside `type.parsed-todo.ts`. A private file exporting nothing may be named for what it
  does. (check)
- **A test is named for the file it tests,** beside it, with only the suffix added: `system.add-todo.test.ts`
  tests `system.add-todo.ts`, `.browser.test.ts` for one that runs in a browser. `index.test.ts` tests a
  component through its interface; a test of the app as a whole sits at the source root. (check)
- **`index.ts` re-exports and nothing else:** `export * from './<root file>.js'`, and named re-exports of parts a
  parent passes on. Components import each other only through `index.ts`: never a deep path, never into a private
  folder, and a part never imports its parent. (check)
- **A public export nothing outside its component uses is a violation:** move it to a private folder, unless its file
  says `// component-check: unused-export-ok <reason>`. (check)
- **Each layer has a `README.md`:** `# <name>`, a concise summary paragraph, then only as much as understanding it
  needs. (check)
- **A render system needing a helper module, such as a shader,** is a root file `system.x.ts` re-exporting the
  implementation typed as `System`, and a folder `system.x/` holding it and its helpers.

## Systems, apps and plugins

- **Every `model` and `view` exports `systems: readonly System[]` from `constant.systems.ts`:** what the world adds,
  empty if none. A part's systems are spread into its parent's. (check)
- **An app lists the layers' `systems`;** a headless run lists the models'. A system the world adds only through
  `systems` is private; one run by `world.run`, or ordered against by others, is exported by name. A system that nothing
  lists, composes, runs or adds is a violation, as is an app leaving out the systems of a layer its layers need. (check)
- **A model system never names a view system.** Order them with the view system's `before` or `after`, or with a
  phase: an empty system that systems written apart run `during`, and what needs their result runs `after`.
- **A plugin** is what an app adds and removes as a unit: `Plugin` from `@adobe/ecs`, its `systems` and an optional
  `connect` to what's outside the world. A `ports` layer exports its plugin, whose systems are its own and the models'
  it needs. The values a connection needs are names of `PluginConfig`, declared by the plugin's module, and
  `Plugin.start(world, plugins, config)` asks for each once.

## Data

- **Keys are top-level `Symbol()` constants** declared, by `declare module "@adobe/ecs"`, in the file that defines
  them. Archetypes are PascalCase `as const` arrays. An entity reference is a component of its own (`type: Entity`),
  never a field of a struct.
- **Persist only independent data;** derived data is derived again on load.
- **Read with a query,** not an `Index`, unless the system looks up by key or reads a set from inside another system.
- **Commands,** not row assignment, for anything a changes finalizer must see.
- **Hot paths allocate nothing per frame,** and have a benchmark.

## Diagrams

`ecs-architecture diagrams` writes, from what the code imports, `ARCHITECTURE.md` at the source root (the features as
a graph, the most core at the bottom), one for each feature with several layers, and a parts diagram in the README of
a layer with three parts or more. Each is the text between `<!-- architecture:start -->` and `<!-- architecture:end -->`;
the descriptions are written by people: the `> ` line of a feature's `ARCHITECTURE.md`, or the first sentence of a
single-layer feature's README, at most 64 characters. `--check` fails while one is out of date.

## Configuration

Each part of the organization is configurable in the app's `package.json`, under `"ecsArchitecture"`: `source`
(`"src"`), `layers` (each layer and those it may import), `kinds`, `apps` (folders holding apps rather than features),
`headless`, `systems` (the layers exporting systems), `banned` (modules a layer may not import) and `agents` (the
folder the agent rules go in, the repository's root by default).
