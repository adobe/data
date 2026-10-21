# Todo sample

A todo app whose world drives every change to the DOM through systems, while its elements know nothing about the ECS.
It's the experiment for `ecs-dom.md`: vanilla custom elements, no framework, no persistence.

`pnpm sample`, then open `/todo/`. Add, toggle, edit (double-click), delete, move (drag, or Alt+↑ and Alt+↓), mark all
done or none, clear those done, filter, and generate 10 or 1,000 todos.

## How the DOM is driven

- **Elements** (`*/elements/`) take properties and dispatch DOM events. A property write that changes nothing is
  dropped, and an element never changes a property its owner writes: a checkbox click dispatches `todo-toggle` and
  leaves the row showing its `done` until the world writes it. State only the DOM owns stays there: the draft in the
  entry, the editing state of a row, focus.
- **Fixed elements**, those in `index.html`, are resources: each feature finds its own within the page's root when
  the app starts. Every DOM system that uses one declares it in `resources.is`, so it's skipped in a world without it.
- **Repeated elements** are component values on the entity they show, declared on `main`: a todo's `row`.
  - *Created* by an ordinary system, `createRows`, over todos without a row, which adds the row by a command. It runs
    on the tick after the run that added the todo, since observer systems can't issue commands.
  - *Bound* by an observer system, `bindRows`, with the row and the values it shows in `changed`: it writes a new row
    once and then only rows whose todo changed, after each run's and tick's sync point.
  - *Placed* by an observer system, `placeRows`, which runs the rows whose row or order changed in list order, through
    a sorted index, and puts each after the row before it, which is always placed already. A row already in place
    isn't touched, and one in the list moves with `moveBefore`, never leaving it, so it keeps its focus; where the
    browser has no `moveBefore`, it gets its focus back.
  - *Filtered* by the filter feature's observer system, `filterRows`, which sets `hidden` on rows whose visibility
    changes, as their todo or the filter changes, and moves focus off a row it hides to the nearest one shown.
  - *Removed* by a finalizer on the row, which runs whatever ends the todo, `world.dispose()` included.
  - Rows out of view skip their rendering (`content-visibility: auto`).
- **Events become runs** in each feature's `events.ts`: listeners on the page's root call `world.run(system, input)`
  and leave the promise; a rejected run goes unhandled, which the browser logs. An event from a row names its todo
  through `todoOf`, a `WeakMap` from row to entity that `createRows` fills.
- **Failures** of runs and ticks alike are reports, entities the world spawns; the app adds `logFailures`, an observer
  system with `changed: [Report.failures]` that logs each failure once, an observer pass's at the next pass.

## Structure

```
index.html            the page: the fixed elements and their layout
app/app.ts            lists the features, defines their elements, creates the world and connects the events
app/main.ts           starts the app on the page
app/log-failures.ts   logFailures
shared/feature.ts     Feature: what the app needs of a feature
shared/connect.ts     on: listening for events
features/<feature>/
    data.ts           components, resources, archetypes and indexes: the feature's data
    model.ts          systems with input, one per thing a user does: they change data and know no DOM
    dom.ts            the components and resources holding elements, and the systems that drive them
    events.ts         connect: DOM events to runs of the model's systems
    elements/         custom elements, importing only each other
    feature.ts        the feature as the app composes it
```

The features are `todos`; `filter`, `completion` and `generate` build on it. A feature imports only the layers of a
feature it builds on, never one built on it, and never the app. Within one, `model` imports only `data`; `dom` imports
`data` and its elements; `events` imports `model` and `dom`. Registration happens as modules load, so a feature's
components, indexes and finalizers exist wherever one of its modules is imported, and `feature.ts` lists only what
the app must do with it: define its elements, find its fixed elements, add its DOM systems and connect its events.
Adding a feature is a folder and a line in `app/app.ts`.

## Tests

- `*/model.test.ts`, in node: each feature's model systems against a world, read back through observer systems.
- `*/elements/*.browser.test.ts`: elements alone, with no world: properties set, the render checked, events recorded.
- `*/dom.browser.test.ts`: a feature's DOM systems driving real elements, after the loop ticks: rows inserted,
  removed without a node left, moved with only the moved row touched and its focus kept, filtered with focus moved
  off, edited; no rows without a list; none for a todo deleted before its tick; several runs before one tick; all
  removed on dispose.
- `app/app.browser.test.ts`: the whole app on the page's markup, used through DOM events as a user would, with no
  console errors; edits committed on blur; a row's events after its todo is deleted; a tick's system's and observer
  system's failures logged.
- `app/proportional.browser.test.ts`: each operation's DOM mutations, and how often the DOM systems reach rows, are
  the same with 100 todos as with 2,000, less what each row it changed costs.
- `imports.test.ts`: the layer rules above, and elements importing nothing but each other. `build.test.ts`: the page
  builds. `app/log-failures.test.ts`: a run's failures logged once each, an observer pass's at the next pass.
- `app/todo.perf-browser-test.ts` and `app/profile.perf-browser-test.ts`, with `pnpm test:perf src/samples/todo`:
  times, mutation counts and a profile, logged.

## Performance

Apple M1 Max, Chromium, with other benchmarks running on the machine. A run's time includes the observer systems
after it; each is the median of 21 runs, each made after a rendered frame as an event's would be, unless it's a single
pass. The tick after it is timed from its frame's start to the end of its observer systems. Mutations count the page's
and its shadow roots' records until that tick ends.

| Operation | 1K run ms | 10K run ms | Tick after, ms | Mutations |
|---|---:|---:|---:|---:|
| Run that changes nothing | 0.03–0.10 | 0.025 | 0.04–0.17 | 0 |
| Toggle one | 0.15–0.41 | 0.14–0.18 | 0.05–0.19 | 2 |
| Edit one | 0.10 | 0.06 | 0.03–0.06 | 1 |
| Move last to first | 0.14 | 0.13–0.15 | 0.05 | 2 |
| Add one, with its row | 0.27 | 0.26–0.31 | 0.05–0.08 | 4 |
| Toggle all | 1.0 | 7.2–8.4 | 0.06 | 1 per todo, and 4 |
| Filter half the rows | 0.28 | 2.1 | 0.05 | 1 per row hidden, and 2 |
| Filter half the rows, laid out | 1.8 | 17 | 0.05 | 1 per row hidden, and 2 |
| Generate N todos | 1.7 | 2.6–3.6 | — | not measured |
| Create and place N rows | 9.8 | 94–114 | — | 3 per row |
| Lay N rows out | 7.3 | 39 | — | — |

Operations on one todo cost about the same at 1K and 10K; ranges are over runs on a busy machine. Moving a row by the
DOM alone takes 0.075 ms of the move's 0.13. Back to back, runs cost far less than one made after a frame:
`app/profile.perf-browser-test.ts` has a run that changes nothing at 2.5–3.7 µs in the app and 1.0 µs in an empty
world, and toggling one at 26 µs with 1K todos, 62 µs with 10K and 400 µs with 100K (see Findings).

## Findings

What the current API does and doesn't offer the DOM path, each with the change it would take.

- **Observer systems can't issue commands,** so a row is created by an ordinary system on the tick after the run that
  added its todo. That tick runs at the next animation frame, before that frame is painted, so a row added in response
  to an event shows in the frame that would have shown it anyway, at 0.05–0.08 ms. *No change needed.*
- **Observer systems can't declare `up`.** A view entity of its own, `{ view, viewOf }`, can't be bound by an observer
  through `up: { through: viewOf }`; as a ticking system, its writes come a tick late, and a new view's first only on
  the tick after it's made. *Proposal:* allow `up` in observer systems, which only read through it.
- **`order` can't go with `up`.** Views can't be placed in their models' order from a system over the views.
  *Proposal:* let `order` take an index over the entity a reference names, or allow it with `up`.
- **No entity is found by its element.** Object parts of index keys are interned by structure (`index-keys.ts`,
  `canonical` is `JSON.stringify`), so every element is the same key `{}` and an index on `row` can't tell rows apart.
  The sample keeps a `WeakMap` from row to entity, written where the row is made, which costs one entry per row and
  nothing per run. *Proposal:* identity-keyed object parts, as a trait of the component (`key: "identity"`), for
  unique lookups by element; otherwise document the `WeakMap` as the pattern.
- **A binding helper can't be typed** from the public types. A generic `bindProperties(element, { label, done })`
  builds `components: { read: [element, ...keys] }` with keys widened to `keyof Components`, and `System.create`
  rejects it: `Property '"error: its object components and resources live on different threads"' is missing`, since
  any component might be on another thread; its body then reads by `Reflect`. *Proposal:* none unless bindings get
  their own constructor; a binding is four to six lines.
- **A run's fixed cost** in Chromium is small, and none of it is a task: a run that changes nothing takes 1.0 µs back
  to back in an empty world, at most 0.3 µs more with the app's seven observer systems added, and 2.5 µs in the app
  with 1K todos, where a
  task round trip takes 7.6 µs. Node's `run idle` is 0.33 µs. A run made right after a frame, as an event's is, takes
  0.02–0.10 ms, which is the CPU coming back from idle, not the ECS. Toggling one todo of 10K takes 62 µs, of which
  the profile gives 64% to `mergeEntries` (`index-hash.ts`), keeping `completion/byDone`'s two buckets of 5K entries in
  entity order, and 16% to `forEachPassingRange` (`ranges.ts`), the change filters scanning the 1024 row ticks of the
  one chunk that changed, for each observer system with `changed`. The rest is the sync point, the observer pass and
  the DOM writes, about 13 µs. *Proposals* in the next two findings.
- **A low-cardinality hash index costs O(bucket) per change:** toggling one todo moves it between `byDone`'s buckets,
  and each bucket's entries shift to stay in entity order: 26 µs a toggle at 1K, 62 at 10K, 400 at 100K. *Proposal:*
  unordered buckets with swap-remove and a position per entity, sorted only when a list is read in entity order; or
  a count-only index for what reads only `length`.
- **A change filter scans a whole chunk for one changed row,** 1024 ticks for each system with `changed`. *Proposal:*
  a second level of ticks per 32 or 64 rows, or a list of the rows changed per chunk.
- **Values a binding reads must be on `main`.** Strings and other objects live on one logical thread, and a system
  can't mix `"world"` and `"main"` values even when the world is on the main thread, so `label` and `filter` are
  declared `thread: "main"` and the model systems that write them run there. *No change needed* while the world is on
  the main thread; a world on a worker would need these values copied to `main`.
- **Nothing awaits the next tick.** Tests watch `clock` changes through an observer, after a first run that passes it
  regardless, and a world ticks only while a system that isn't an observer is added. *Proposal:* none for consumers; a
  test helper in `src/observe` would do.

## Not kept

- **Layers at the top**, one `data.ts`, `model.ts`, `dom.ts` and `events.ts` holding every feature's part: 27 files
  instead of 47 and half the imports, but a feature's parts are spread over four files, its tests share files with
  the others', nothing shows which feature builds on which, and removing one means editing every layer.
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
