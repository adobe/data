# The architecture standard

How an application on `@adobe/ecs` organizes its source. `ecs-architecture check` enforces each rule marked
(check); each violation it reports says how to fix it.

## Features, layers, components

```
src/                the root feature: the foundation every feature builds on, if any
  index.ts          the package's public API, re-exported; importing it has no side effects; an app with none
                    has `export {};` or no index.ts
  <layer>/          the root's own layers, if the app has a foundation
  features/
    main/           the feature that puts the others together: its entries start the app
    <feature>/      a vertical slice
      elements/     custom elements that know nothing of the ECS: the DOM only
      model/        data, derivations and systems that make sense headless: what's persisted and inspected
      ports/        glue to outside sources independent of this feature's markup: device input, network, storage, timers
      view/         systems that render the model, binding the DOM or drawing on the GPU, and connect this feature's widgets
      features/     its sub-features, which build on its layers
      test/         its test features: what its tests share, which only they import
  test/             the app's test features
```

A *feature* is a vertical slice; each *layer* is a *component*: a folder with an `index.ts` and a `README.md`, whose
exports are its public API and nothing else. The rule is recursive: a layer made of parts holds each part as a component
of its own. A feature holds only its layers, `features/` and `test/`, so every folder name says what it is. Every layer is
optional, but every feature has at least one; the source root alone may have none. (check)

**Subjects are features; the root holds the foundation.** Every subject the app is about is a feature, something a
user or product owner would name, even when it's the only one; the root's layers hold only the foundation features
build on, infrastructure or data that isn't a subject of its own. Infrastructure belongs to the foundation whoever uses it,
even a single feature, as a generic list element does; a feature's own layers hold what is about its subject. So an
app grows without moving its subjects: a new
one is a sibling, or nests inside what it extends, and what turns out to be shared moves down into the root. A library
is mostly foundation: its root layers are the library, which `src/index.ts` re-exports as its API, and its features are
the optional subjects a consumer opts into; it has no `main`, as nothing starts it.

**Nesting follows dependency.** A feature builds on its ancestors' layers and uses its siblings, importing them in
any way, extending a class as much as calling a function, and what several
features use belongs to the lowest feature they all build on: the app's foundation in the root's layers, what todos'
refinements share in `todos`' layers. A parent uses its own sub-features only to aggregate them, in its plugins,
composing theirs, and its indexes, re-exporting them, so that its users take the whole subtree as one unit; anything
else it needs from them belongs in its own layers. Layers import each other without cycles. (check)

Layers by what they depend on, `elements` ← `view` → `model` ← `ports`:

| Layer | May import | May not |
|---|---|---|
| `elements` | `elements` | any `@adobe/*`: plain custom elements, properties in, DOM events out |
| `model` | `model` | the DOM, network, timers, `globalThis`, `Date.now`, `performance.now`, `@adobe/ecs-gpu`, UI libraries |
| `ports` | `model`, `ports` | `@adobe/ecs-gpu`; a widget's selectors: it's handed its targets and predicates |
| `view` | `model`, `elements`, `view` | `ports`, which never imports `view` either |

The model runs headless, and a test drives it through its public systems; time is the `clock` resource. A feature is
about its own subject only: input-device code doesn't belong in a rendering feature. (check)

Which layer? Model, if a headless run would care: the selected tool, the selection. View state, a dialog open or a
panel collapsed, belongs to the view. A widget's meaning, a click on a tool button, is the view's; a raw stream, pointer
or keys, is a port's.

**Entries start things.** An entry, `entry.<name>.ts` at the root of the layer whose imports it needs, is the only
module that runs code as it loads: a page's `<script type="module" src>`, a worker's script or a node script. It exports
nothing, its index doesn't re-export it, and what it imports from other components counts as used. It holds its own
start-up, read top to bottom, in a local function when it returns early, its helpers beneath it as function
declarations; what a test also needs, such as a function starting the app within any root, is declared in its layer. Any other module only declares: a top-level call, `new` or `await` is a violation, but for
`Component.derive`. (check)

**An application's start is a feature, `features/main`,** like any other: its entries create the world and start the other
features' plugins, in the layers they need, `features/main/view/entry.page.ts` for a page and, say,
`features/main/ports/entry.loader-worker.ts` for a worker. A layer holding only entries and private code has an index
of `export {};`. Everything that starts a program is in `main`: a page, a worker, a node script, and each of several
apps one page offers, such as samples a viewer switches between, as a sub-feature of `main`.

**`main` composes, so it may import any layer** of any feature, its own sub-features' too: a page starts views and
ports both, which no other layer may import together. The modules a layer may not import, such as `@adobe/ecs-gpu` in a
`model`, stay banned in `main`'s layers. Nothing outside `main` imports it: as it depends on every feature, a feature
importing it closes a cycle. (check)

**Test features** are features in a feature's `test/`: helpers its tests share, such as a world holding some todos or
a promise of the next tick, or a fixture that is an idea of its own, one declaration per file like any other. Like any
feature, each is named for what it is, `test/todos` for helpers testing todos, `test/ticks` for waiting on ticks,
whether or not that is a subject. They sit at the lowest feature whose tests share them, the app's in `src/test/`; only the tests and test features of that
feature, and of its sub-features, import them, and they add no systems to an app. (check)

## What is public

- **Public declarations live at a component's root, one per file, named `<kind>.<name>.ts`**, `<name>` kebab-case and
  the file named for its export: `component.todo-title.ts` exports `todoTitle`. Kinds: `type`, `constant`, `component`,
  `resource`, `archetype`, `index`, `function`, `system`, `plugin`, `element`. (check)
- **Modifiers may come before the kind,** the app's own, to group files as it sees them: `persistent.component.done.ts`
  and `persistent.resource.filter.ts` sort together. The kind and the name are checked; the modifiers aren't. (check)
- **A root file's export is its first declaration and its only export.** After the imports come its doc comment and the
  one `export`, typed as its interface (`export const clearCompleted: System = System.create(...)`); what it needs comes
  beneath it. Only what the export's statement needs as the module loads, such as an `Index` its declaration names, may
  sit above it, with what fills it, such as a loop pushing into an array the export reads. A function declared beneath
  and called as the module loads may call other hoisted functions and read `var`s and imports, but a `const`, `let` or
  `class` it reads sits above the call: beneath it, it isn't initialized yet. (check)
- **A system is typed `System`**, with type arguments only for its input and result: `System<{ readonly amount: number }, Entity>`,
  `void` for no input. (check)
- **Anything else is private, and lives with what uses it.** What only one declaration uses is its part: by default an
  unexported declaration in its file, beneath its export, or above it when the export reads it as the module loads, as
  a composite reads its parts. A part moves into a file of its own, in a folder named for
  the declaration beside it, for either of two reasons:
  - **a test reaches it:** a test imports it by its path, which needs it exported from a file of its own;
  - **the file outgrows one reading:** past 400 lines (check), or sooner once it holds several ideas a reader would
    take one at a time, its parts become files, each about one of them.

  So `system.draw-frame.ts` keeps its parts in `system.draw-frame/`, `function.frame.ts` in `function.frame/`,
  `entry.page.ts` in `entry.page/`, and a plugin its systems in `plugin.todos-view/`; a declaration in `internal/` keeps
  its parts in a folder beside it there. A reader sees the declaration,
  and its folder is its implementation, each part a file named as at the root. (check)
- **`internal/` holds only what several of a component's public declarations use,** directly, through their parts or
  through other files of `internal/`; what only one uses is its part, and a file there only one uses is a violation.
  An entry is a user like a declaration: what several entries of a layer share is in `internal/` too. A large
  `internal/` usually means the layer is several features: split it, so each holds what it uses. (check)
- **A component's folders are its parts, its `internal/`, or part components** (with an `index.ts` of their own); a
  folder of any other name, such as `shared/` or `systems/`, is a violation. (check)
- **Every file of a component that exports is a declaration file,** in a private folder as at its root: named
  `<kind>.<name>.ts`, exporting `name` alone, first. A function and the types it takes are files of their own:
  `function.parse-todo.ts` beside `type.parsed-todo.ts`. A private file exporting nothing may be named for what it
  does. (check)
- **A test is named for the file it tests,** beside it, with only the suffix added: `system.add-todo.test.ts`
  tests `system.add-todo.ts`, `.browser.test.ts` for one that runs in a browser, and likewise for an app's other test
  suffixes, such as `.perf-browser-test.ts`. `index.test.ts` tests a component through its interface; a test of the
  app or package as a whole, its build, its architecture or a benchmark of the whole app, sits at the source root. A
  test comparing several peers, such as a GPU implementation against the CPU one it mirrors, sits beside one of them,
  usually the one written to match the other, and is named for it. A test exports nothing, and
  there are no test helper files: what tests share, or a fixture that is an idea of its own, such as a reference
  implementation a test compares against, is a test feature, one declaration per file; a small helper one test uses is
  in that test. (check)
- **`index.ts` re-exports and nothing else:** `export * from './<root file>.js'`, and named re-exports of parts a
  parent passes on. Components import each other only through `index.ts`: never a deep path, never into a private
  folder, and a part never imports its parent. (check)
- **A public export nothing outside its component uses is a violation:** move it to a private folder, unless its file
  says `// component-check: unused-export-ok <reason>`, which also keeps a public system nothing runs yet, such as one
  for a feature still to come. What `src/index.ts` re-exports, the package's public API, and
  what an entry imports are used; what only tests import isn't, so tests never widen an interface. (check)
- **A test reaching past a component's interface imports the file by its path,** private ones included, which only tests
  may do: `import { bindRows } from "../../todos/view/plugin.todos-view/system.bind-rows.js"`. A test feature, test code
  too, may do the same, and neither's imports make a file of `internal/` shared. Test features are themselves used
  through their index. (check)
- **Each layer has a `README.md`:** `# <name>`, a concise summary paragraph, then only as much as understanding it
  needs. (check)

## Systems and plugins

- **A layer whose systems an app adds together, or that connects to the outside, exports one plugin,**
  `plugin.<feature>-<layer>.ts` exporting `<feature><Layer>`: `Plugin` from `@adobe/ecs`, its `systems` and an optional
  `connect` to what's outside the world. Its `systems` lists the layer's own systems, those only it reaches its parts
  in `plugin.<feature>-<layer>/` and those others run or order against public at the root, and spreads its
  sub-features' plugins of the same layer; never another feature's or another layer's, so a ports plugin often only
  connects, and whoever starts it starts its model's plugin beside it. As every plugin meets
  the others in `main`, no two share a name: features of one name in different places are renamed for what sets them
  apart. (check)
- **A layer offering systems for the app to choose among,** alternatives such as a CPU and a GPU move, or frames an
  app runs itself, exports them as public systems and has no plugin; the app's entry composes the ones it picks. A
  layer of helpers alone, such as the root's `view` of DOM helpers, has neither.
- **A parent's plugin composes its sub-features' plugins:** `todosView` lists its own systems and spreads
  `filterView`'s and `completionView`'s, and connects them, so `main` starts `todos` alone. A root layer's plugin is
  `plugin.app-<layer>.ts`.
- **`main` starts the plugins** with `Plugin.start(world, plugins, config)`, which composes their systems into one, the
  config left out when no plugin asks for anything. An app splitting its world over threads may instead add a
  plugin's `systems` on the thread that runs them. `main` starts the models' plugins beside the views' and the
  ports'.
- **A system nothing in the source reaches is a violation:** each is in a plugin's `systems`, a composite, or passed
  to `world.run` or `world.add`, and a test doing so doesn't count. A layer's root holds only the systems others add to
  a world, run by name or order against; the rest are the parts of their plugin or composite. (check)
- **A model system never names a view system.** Order them with the view system's `before` or `after`, or with a
  phase: an empty system that systems written apart run `during`, and what needs their result runs `after`.
- **The values a connection needs are names of `PluginConfig`,** declared by the module that uses them, and
  `Plugin.start` asks for each once. A value systems need too, such as the app's root element, is also a resource, under
  the same key: `main` gives it to both.
- **A view finds the fixed elements it drives** with a system of its own: from the app's root element, `root`, in the
  root's `view`, it sets the resources holding them as the root changes. So the app gives the world one element, and each view keeps what it
  finds to itself.

## Data

- **Keys are top-level `Symbol()` constants** declared, by `declare module "@adobe/ecs"`, in the file that defines
  them. Archetypes are PascalCase `as const` arrays. An entity reference is a component of its own (`type: Entity`),
  never a field of a struct.
- **A derived component is derived in the file that declares it:** `Component.derive(key, { from, not })` beneath its
  key and `declare module` entry, so whoever imports the key gets its derivations. (check)
- **A release is listed beside what creates it:** a removed system (`System.removed`) runs only while added, so it goes
  in the same plugin as the system making what it releases.
- **Persist only independent data;** derived data is derived again on load.
- **Read with a query,** not an `Index`, unless the system looks up by key or reads a set from inside another system.
- **Commands,** not row assignment, for anything a changes system must see.
- **Hot paths allocate nothing per frame,** and have a benchmark.

## Configuration

Each part of the organization is configurable in the app's `package.json`, under `"ecsArchitecture"`: `source`
(`"src"`), `layers` (each layer and those it may import), `kinds`, `maxLines` (400), `headless`, `banned` (modules a layer may not
import) and `agents` (the folder the agent rules go in, the repository's root by default).
