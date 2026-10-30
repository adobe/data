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
- **Repeated elements** are component values on the entity they show, declared on `main`: a todo's `row`.
  - *Created* by an ordinary system, `createRows`, over todos without a row, which adds the row by a command. It runs
    on the tick after the run that added the todo, since readonly systems can't issue commands.
  - *Bound* by a readonly system, `bindRows`, with the row and the values it shows in `changed`: it writes a new row
    once and then only rows whose todo changed, after each run's and tick's sync point.
  - *Placed* by a readonly system, `placeRows`, which runs the rows whose row or order changed in list order, through
    a sorted index, and puts each after the row before it, which is always placed already. A row already in place
    isn't touched, and one in the list moves with `moveBefore`, never leaving it, so it keeps its focus; where the
    browser has no `moveBefore`, it gets its focus back.
  - *Filtered* by the filter feature's readonly system, `filterRows`, which sets `hidden` on rows whose visibility
    changes, as their todo or the filter changes, and moves focus off a row it hides to the nearest one shown.
  - *Removed* by a finalizer on the row, which runs whatever ends the todo, `world.dispose()` included.
  - Rows out of view skip their rendering (`content-visibility: auto`).
- **Fixed elements showing counts** are bound by a readonly system that runs only when an index's entries changed:
  `bindCompletion` looks up `completion/byDone` with `changed: true`, so it writes the summary and the toggle-all box
  after a pass in which a todo was added, removed or toggled, and is skipped before its body otherwise.
- **Events become runs** in each feature's `events.ts`: listeners on the page's root call `world.run(system, input)`
  and leave the promise; a rejected run goes unhandled, which the browser logs. An event from a row names its todo
  through `entityOf(event)`, the entity the first target on its composed path shows: `createRows` attaches each row
  to its todo (`attach`), and a move's `item` and `before` are read with `entityOfElement`. Systems acting on one
  todo name it as their `target`, so they run on its row alone, writing it in place, and on nothing once it's gone.
- **Failures:** a run whose system failed rejects, and an event's run, its promise left, goes unhandled, which the
  browser logs; what fails in ticks and readonly systems the world reports with `reportError`, which the browser logs
  too, once per system while it keeps failing.

## Structure

```
index.html            the page: the fixed elements and their layout
app/app.ts            defines the features' elements, creates the world through World.create and connects the events
app/main.ts           starts the app on the page
features/index.ts     exports every feature
shared/feature.ts     Feature: what the app needs of a feature
shared/connect.ts     on and all: listening for events, and stopping several listeners at once
shared/attach.ts      attach, entityOf and entityOfElement: the entity an element shows, for its events
shared/elements/      define: defining the elements features list
features/<feature>/
    data.ts           components, resources, archetypes and indexes: the feature's data
    model.ts          systems with input, one per thing a user does: they change data and know no DOM
    dom.ts            the components and resources holding elements, and the composite of the systems that drive them
    events.ts         connect: DOM events to runs of the model's systems
    elements/         custom elements, importing only each other
    feature.ts        the feature as the app composes it
```

The features are `todos`; `filter`, `completion` and `generate` build on it. A feature imports only the layers of a
feature it builds on, never one built on it, and never the app. Within one, `model` imports only `data`; `dom` imports
`data` and its elements; `events` imports `model` and `dom`. Registration happens as modules load, so a feature's
components, indexes and finalizers exist wherever one of its modules is imported, and `feature.ts` lists only what
the app must do with it: its elements, by tag name, which the app defines; how it finds its fixed elements; its DOM
systems as one composite, which the app adds; and how it connects its events. Elements are defined by the app rather
than as their modules load: the package's `sideEffects: false` lets a bundle drop a module imported only for that.
Adding a feature is a folder and a line in `features/index.ts`.

## Tests

- `*/model.test.ts`, in node: each feature's model systems against a world, read back through readonly systems.
- `*/elements/*.browser.test.ts`: elements alone, with no world: properties set, the render checked, events recorded.
- `shared/attach.browser.test.ts`: the entity an element was attached to, found from an event on it or within its open
  shadow root, and none for others.
- `*/dom.browser.test.ts`: a feature's DOM systems driving real elements, after the loop ticks: rows inserted,
  removed without a node left, moved with only the moved row touched and its focus kept, filtered with focus moved
  off, edited; no rows without a list; none for a todo deleted before its tick; several runs before one tick; all
  removed on dispose.
- `app/app.browser.test.ts`: the whole app on the page's markup, used through DOM events as a user would, with no
  console errors; edits committed on blur; a row's events after its todo is deleted; a tick's system's and readonly
  system's failures reported.
- `app/proportional.browser.test.ts`: each operation's DOM mutations, and how often the DOM systems reach rows, are
  the same with 100 todos as with 2,000, less what each row it changed costs.
- `imports.test.ts`: the layer rules above, elements importing nothing but each other, and worlds, the tests' and
  benchmarks' too, made only through `World.create` from the package root, never through the implementation.
  `build.test.ts`: the page builds.
- `app/todo.perf-browser-test.ts` and `app/profile.perf-browser-test.ts`, with `pnpm test:perf`:
  times, mutation counts and a profile, logged.

## Performance

Apple M1 Max, Chromium, with other benchmarks running on the machine. A run's time includes the readonly systems
after it; each is the median of 21 runs, each made after a rendered frame as an event's would be, unless it's a single
pass. The tick after it is timed from its frame's start to the end of its readonly systems. Mutations count the page's
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

- **Readonly systems can't issue commands,** so a row is created by an ordinary system on the tick after the run that
  added its todo. That tick runs at the next animation frame, before that frame is painted, so a row added in response
  to an event shows in the frame that would have shown it anyway, at 0.05–0.08 ms. *No change needed.*
- **Readonly systems can't declare `up`.** A view entity of its own, `{ view, viewOf }`, can't be bound by a readonly system
  through `up: { through: viewOf }`; as a ticking system, its writes come a tick late, and a new view's first only on
  the tick after it's made. *Proposal:* allow `up` in readonly systems, which only read through it.
- **`order` can't go with `up`.** Views can't be placed in their models' order from a system over the views.
  *Proposal:* let `order` take an index over the entity a reference names, or allow it with `up`.
- **No index finds an entity by its element.** Object parts of index keys are interned by structure
  (`index-keys.ts`, `canonical` is `JSON.stringify`), so every element is the same key `{}` and an index on `row`
  can't tell rows apart. The sample attaches the entity to the element where the row is made, under a symbol only
  `shared/attach.ts` holds, which costs one property per row and nothing per run. *No change needed.*
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
