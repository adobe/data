# Todo sample

A todo app whose world drives every change to the DOM through systems, while its elements know nothing about the ECS.
It's the experiment for `ecs-dom.md`: vanilla custom elements, no framework, no persistence.

`pnpm dev` in this package serves it alone; `pnpm dev` in `ecs-sample-browser` serves it in the sample browser, as the Todos
tab. Add, toggle, edit (double-click), delete, move (drag, or Alt+↑ and Alt+↓), mark all done or none, clear those done,
filter, and generate 10 or 1,000 todos.

## How the DOM is driven

- **Elements** (`*/elements/`) take properties and dispatch DOM events. A property write that changes nothing is
  dropped, and an element never changes a property its owner writes: a checkbox click dispatches `todo-toggle` and
  leaves the row showing its `done` until the world writes it. State only the DOM owns stays there: the draft in the
  entry, the editing state of a row, focus.
- **Fixed elements**, those in `index.html`, are resources: each feature finds its own within the page's root when
  the app starts. Every DOM system that uses one declares it in `resources.is`, so it's skipped in a world without it.
- **Repeated elements** are rows of a virtual list, `<virtual-list>` (the root's `elements`), which holds in the DOM
  only the rows near the view: those in it and half a screen's height more above and below. It knows nothing of the
  ECS: it names the range of items it needs, dispatches `virtual-range` as scrolling or resizing changes it, and is
  given the keys of those items, here todos' entities.
  - *Rendered* by a readonly system, `renderRows`, after each run and tick: it reads the range of the todos the list
    shows, in list order, through the sorted `ordered` index, or `byDoneInOrder` while a filter keeps some, and gives
    the list their entities. A row keeps the todo it shows while it stays in the range, so its content is written once;
    scrolling reuses the rows of todos that left the range for those that entered, moving them by a transform, never in
    the DOM, and binds only those, attaching each to its todo (`attach`). A pass whose range and todos are those shown
    writes nothing. The plugin runs `renderRows` as the range changes.
  - *Bound* by a readonly system, `bindRows`, over todos whose label or done changed: it writes them to the todo's row,
    where the list has one.
  - *Moved* by their place: a row whose todo moved, or whose todos before it changed, is moved by a transform, so the
    focused row stays focused. The focused row also stays while its todo scrolls out of the range, wherever its todo
    is, and when its todo is no longer shown, the row now at its place takes the focus.
  - *Filtered* by what the list shows: the filter feature's `filterRows` sets the todos view's `onlyDone`, and
    `renderRows` renders only the todos it keeps.
  - *Removed* as their todos leave the range, and all of them once the plugin is disconnected.
- **Fixed elements showing counts** are bound by a readonly system that runs only when an index's entries changed:
  `bindCompletion` looks up `todos/byDoneInOrder` with `changed: true`, so it writes the summary and the toggle-all box
  after a pass in which a todo was added, removed or toggled, and is skipped before its body otherwise.
- **Events become runs** in each feature's plugin: its listeners on the page's root call `world.run(system, input)`
  and leave the promise; a rejected run goes unhandled, which the browser logs. An event from a row names its todo
  through `entityOf(event)`, the entity the first target on its composed path shows: `renderRows` attaches each row
  to its todo (`attach`), and a move's `item` and `before` are read with `entityOfElement`. Systems acting on one
  todo name it as their `target`, so they run on its row alone, writing it in place, and on nothing once it's gone.
- **Failures:** a run whose system failed rejects, and an event's run, its promise left, goes unhandled, which the
  browser logs; what fails in ticks and readonly systems the world reports with `reportError`, which the browser logs
  too, once per system while it keeps failing.

## Structure

The sample follows the `@adobe/ecs` architecture standard (`@adobe/ecs-architecture`): its features are in
the source root, each split into layers, and `main` puts them together.

```
index.html                 the page: the fixed elements and their layout
view/                      the app's foundation, what every view uses of the DOM: root, the element the app is
                           mounted in, and attach, entityOf, entityOfElement, on, all, define
elements/                  the foundation's elements: <virtual-list>, a list holding only the rows near the view,
                           which <todo-list> extends
features/
    main/view/             the app: entry.page.ts, which index.html loads, starts it on the page; createApp creates
                           the world, holding the page's element as root, and starts the todos' plugin
    todos/                 todos: model, elements and view, whose plugin composes its sub-features'
        features/          filter/, completion/, generate/: what builds on todos, each with its own layers
test/                      the app's test features: dom/elements, ticks/model, todos/model, which only tests import
```

The features are `todos`, whose list is the foundation's `<virtual-list>`, and its sub-features `filter`, `completion` and `generate`,
which build on it; every view builds on the root's `view`. Each feature's view exports its plugin,
`plugin.<feature>-view.ts`: its systems, private in `plugin.<feature>-view/`, the first finding the view's elements
within `root`, and its `connect`, which defines its elements and listens for their events on the root. `todosView`
composes its sub-features' plugins, so the app creates the world with the page's element as `root` and starts the one
plugin: `Plugin.start(world, [todosView], { [root]: element })`. Registration happens as modules
load, so a feature's components, derivations and indexes exist wherever one of its modules is imported. Elements are
defined by the plugins rather than as their modules load: the package's `sideEffects: false` lets a bundle drop a
module imported only for that.

## Tests

- `*/model/index.test.ts`, in node: each feature's model systems against a world, read back through readonly systems.
- `*/elements/index.browser.test.ts`: elements alone, with no world: properties set, the render checked, events recorded.
- `view/index.browser.test.ts`: the entity an element was attached to, found from an event on it or
  within its open shadow root, and none for others.
- `elements/index.browser.test.ts`: the range it asks for and when, rows placed at their
  index, only rows given a new key bound and the rest untouched, and the focused row kept or its focus passed on.
- `*/view/index.browser.test.ts`: a feature's DOM systems driving real elements: rows rendered in list order, written
  only where their todo changed, removed, moved by their place alone with focus kept; no rows without a list; only the
  range of many todos rendered, and rendered again as the list scrolls, reusing its rows; the todos the filter keeps,
  with focus moved off a row it leaves out.
- `features/main/view/function.create-app.browser.test.ts`: the whole app on the page's markup, used through DOM events as a user
  would, with no console errors; edits committed on blur; a row's events after its todo is deleted; a tick's system's
  and readonly system's failures reported; and each operation's DOM mutations, and how often the DOM systems write
  rows, the same with 100 todos as with 2,000: they follow what changed and the rows rendered.
- `architecture.test.ts`: the architecture standard's check, and the repository's agent rules up to date. `imports.test.ts`: the package imported only by its root, so worlds, the tests' and benchmarks' too, are made
  through `World.create`, never through the implementation; the build plugin only in the configuration; and nothing
  importing the app. `build.test.ts`: the page builds.
- `todo.perf-browser-test.ts` and `profile.perf-browser-test.ts`, with `pnpm test:perf`:
  times, mutation counts and a profile, logged.

## Performance

Apple M4 Max, Chromium. A run's time includes the readonly systems after it; each is the median of 21 runs, each made
after a rendered frame as an event's would be, unless it's a single pass. The tick after it is timed from its frame's
start to the end of its readonly systems. Mutations count the page's and its shadow roots' records until that tick
ends. The list is 600px tall, so it renders about 30 rows: those in view and half a screen more on either side.

| Operation | 1K run ms | 10K run ms | Tick after, ms | Mutations |
|---|---:|---:|---:|---:|
| Run that changes nothing | 0.10 | 0.065 | 0.15–0.17 | 0 |
| Toggle one | 0.34 | 0.25 | 0.18–0.20 | 1, and 2 for a todo with a row |
| Edit one | 0.14 | 0.12 | 0.16–0.17 | 0, and 1 for a todo with a row |
| Move last to first | 0.53 | 0.43 | 0.16 | 1 per row rendered |
| Add one | 0.29 | 0.30 | 0.05 | 2 |
| Toggle all | 1.1 | 3.5 | 0.06 | 1 per row rendered |
| Filter half the todos | 0.15 | 0.16 | 0.42–0.49 | about 2 per row rendered |
| Filter half the todos, laid out | 0.95 | 0.97 | 0.45–0.51 | about 2 per row rendered |
| Scroll two views down, laid out | 1.3 | 1.3 | 0.10 | about 3 per row rendered |
| Generate N todos, with their rows | 1.9 | 8.3 | — | about 4 per row rendered |
| Lay the rows out | 4.5 | 0.71 | — | — |

Only toggling all and generating grow with the number of todos, through the model and its indexes; what the DOM costs
follows the rows rendered. A todo out of the range costs no DOM work at all, so toggling or editing one is mostly the
summary's count. Before the list was virtual, every todo had a row: at 10K, creating and placing them took 94–114 ms
and laying them out 39, filtering half of them, laid out, 17 ms, and toggling all wrote every row.
`profile.perf-browser-test.ts` has, back to back, a run that changes nothing at 0.6 µs in an empty world and
1.5–1.8 µs in the app, and toggling one at 4.4–5.1 µs with 1K, 10K and 100K todos.

## Findings

What the current API does and doesn't offer the DOM path, each with the change it would take.

- **Readonly systems can't issue commands,** which a row held as a component needs to be created. Rows held by the
  virtual list aren't components, so `renderRows`, a readonly system, renders a new todo's row after the run that
  added it, rather than on the tick after. *No change needed.*
- **A sorted index with a compound key lists a filtered view in order:** `byDoneInOrder`, keyed by `[done, order]`,
  gives the todos not done, or done, in list order, by a prefix of its key, and any range of them by position, so
  rendering a range costs only its rows, whatever the filter. Toggling all 10K todos, moving each within it, takes 3.5 ms for the whole run.
  *No change needed.*
- **Readonly systems can't declare `up`.** A view entity of its own, `{ view, viewOf }`, can't be bound by a readonly system
  through `up: { through: viewOf }`; as a ticking system, its writes come a tick late, and a new view's first only on
  the tick after it's made. *Proposal:* allow `up` in readonly systems, which only read through it.
- **`order` can't go with `up`.** Views can't be placed in their models' order from a system over the views.
  *Proposal:* let `order` take an index over the entity a reference names, or allow it with `up`.
- **No index finds an entity by its element.** Object parts of index keys are interned by structure
  (`index-keys.ts`, `canonical` is `JSON.stringify`), so every element is the same key `{}` and an index on `row`
  can't tell rows apart. The sample attaches the entity to the element where the row is given its todo, under a symbol
  only `attach` holds, which costs one property write per row bound and nothing per run. *No change needed.*
- **A binding helper can't be typed** from the public types. A generic `bindProperties(element, { label, done })`
  builds `components: { read: [element, ...keys] }` with keys widened to `keyof Components`, and `System.create`
  rejects it: `Property '"error: its object components and resources live on different threads"' is missing`, since
  any component might be on another thread; its body then reads by `Reflect`. *Proposal:* none unless bindings get
  their own constructor; a binding is four to six lines.
- **A run's fixed cost** in Chromium is small, and none of it is a task: a run that changes nothing takes 1.0 µs back
  to back in an empty world, at most 0.3 µs more with the app's readonly systems added, and 2.5 µs in the app
  with 1K todos, where a
  task round trip takes 7.6 µs. Node's `run idle` is 0.33 µs. A run made right after a frame, as an event's is, takes
  0.02–0.10 ms, which is the CPU coming back from idle, not the ECS. Toggling one todo of 10K took 62 µs, of which
  the profile gave 64% to keeping `completion/byDone`'s two buckets of 5K entries in entity order, which the next
  finding removes, and 16% to `forEachPassingRange` (`ranges.ts`), the change filters scanning the 1024 row ticks of
  the one chunk that changed, for each readonly system with `changed`, which the finding after it removes. The rest is
  the sync point, the readonly pass and the DOM writes, about 13 µs.
- **A low-cardinality hash index costs O(1) amortized per change:** toggling one todo moves it between `byDone`'s
  buckets, which are left unsorted, its entry leaving a hole in one and joining a tail of the other, until a list is
  read by position (`index-hash.ts`). In node, a toggle and a run reading both buckets' lengths, as the summary does,
  take 5.5, 5.3 and 5.5 µs at 1K, 10K and 100K todos (`bucket move … length`), against 9.1, 64 and 423 µs with every
  bucket kept in entity order; reading each bucket's first rows after it, as `clearCompleted` reads the done ones,
  sorts both buckets first: 6.2, 12.7 and 69 µs (`bucket move … in order`), against 9.4, 65 and 418.
- **A change filter finds one changed row by its block:** it reads the chunk's sixteen block ticks and the 64 row ticks
  of the block that changed, not the chunk's 1024. In a profile of 40,000 toggles of one todo of 10K, the change
  filters take 5.0% of samples, against 6.9% scanning the chunk, most of it the chunk checks of readonly systems
  filtering on two or three components; in node, eight systems filtering on one changed row of 100K take 5.0 µs a
  run, against 34.9 µs scanning the chunk (`changed one 100K`). *No change needed.*
- **Nothing awaits the next tick.** Tests watch `clock` changes through a readonly system, after a first run that passes it
  regardless, and a world ticks only while a system that isn't a readonly system is added. *Proposal:* none for consumers; a
  test helper in `src/observe` would do.

## Not kept

- **A row for every todo,** held as a component, `row`: made by an ordinary system on the tick after its todo, placed
  in list order by a readonly system moving it within the list, hidden by the filter, and removed by a finalizer. Rows
  out of view skipped their rendering (`content-visibility: auto`), but they were still in the DOM: at 10K, creating
  and placing them took 94–114 ms and laying them out 39, filtering half of them, laid out, 17 ms, and toggling all
  wrote every row. The virtual list holds about 30.

- **Layers at the top**, one set of layers holding every feature's part: fewer files and imports, but a feature's
  parts are spread over every layer, its tests share files with the others', nothing shows which feature builds on
  which, and removing one means editing every layer.
- **The app composing each layer of each feature**, importing every feature's DOM systems, events, element
  definitions and resource keys, and taking the fixed elements in a `Page`: the app knew every feature's insides, in
  16 imports where it now has 4.
- **Views as entities of their own**, `{ view, viewOf }`, bound through `up: { through: viewOf }`: the binding became
  a ticking system (see Findings) whose creating system had to write a new view's first values itself, and placing
  views in list order had to run over their todos. It was slower too: 107 ms instead of 98 to create 10K rows, 0.095
  ms instead of 0.080 to toggle one. Nothing here shows a todo twice.
- **Filtering by an attribute of the list**, which style sheets select rows by: one write instead of a pass over the
  rows, 0.025 ms instead of 2.1 at 10K, but dearer once laid out, 25 ms against 17, since every row is restyled. It
  also put the filter's meaning in the list's element.
- **A helper building a binding**: see Findings.
