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
  the app starts. Its DOM systems declare them in `resources.is`, so they're skipped in a world without them.
- **Repeated elements** are component values on the entity they show, declared on `main`: a todo's `row`.
  - *Created* by an ordinary system, `createRows`, over todos without a row, which adds the row by a command. It runs
    on the tick after the run that added the todo, since observer systems can't issue commands.
  - *Bound* by an observer system, `bindRows`, with the row and the values it shows in `changed`: it writes a new row
    once and then only rows whose todo changed, after each run's and tick's sync point.
  - *Placed* by an observer system, `placeRows`, which runs the rows whose row or order changed in list order, through
    a sorted index, and puts each after the row before it, which is always placed already. A row already in place
    isn't touched, and one in the list moves with `moveBefore`, never leaving it, so it keeps its focus.
  - *Filtered* by the filter feature's observer system, `filterRows`, which sets `hidden` on rows whose visibility
    changes, as their todo or the filter changes.
  - *Removed* by a finalizer on the row, which runs whatever ends the todo, `world.dispose()` included.
- **Events become runs** in each feature's `events.ts`: listeners on the page's root call `world.run(system, input)`,
  and log what the run's report says failed. An event from a row names its todo through `todoOf`, a `WeakMap` from row
  to entity that `createRows` fills, since nothing in the world finds an entity by an element.

## Structure

```
index.html            the page: the fixed elements and their layout
app/app.ts            lists the features, defines their elements, creates the world and connects the events
app/main.ts           starts the app on the page
shared/feature.ts     Feature: what the app needs of a feature
shared/connect.ts     on, reported: listening for events and logging failed runs
features/<feature>/
    data.ts           components, resources, archetypes and indexes: the feature's data
    model.ts          systems with input, one per thing a user does: they change data and know no DOM
    dom.ts            the components and resources holding elements, and the systems that drive them
    events.ts         connect: DOM events to runs of the model's systems
    elements/         custom elements, importing only each other
    feature.ts        the feature as the app composes it
```

The features are `todos`; `filter`, `completion` and `generate` build on it. A feature imports only the layers of a
feature it builds on, never one built on it, and never the app. Within one, `model` imports `data`; `dom` imports
`data` and its elements; `events` imports `model` and `dom`. Registration happens as modules load, so a feature's
components, indexes and finalizers exist wherever one of its modules is imported, and `feature.ts` lists only what
the app must do with it: define its elements, find its fixed elements, add its DOM systems and connect its events.
Adding a feature is a folder and a line in `app/app.ts`.

## Tests

- `*/model.test.ts`, in node: each feature's model systems against a world, read back through observer systems.
- `*/elements/*.browser.test.ts`: elements alone, with no world: properties set, the render checked, events recorded.
- `*/dom.browser.test.ts`: a feature's DOM systems driving real elements, after the loop ticks: rows inserted,
  removed without a node left, moved with only the moved row touched, filtered, edited, and all removed on dispose.
- `app/app.browser.test.ts`: the whole app on the page's markup, used through DOM events as a user would, with no
  console errors.
- `app/proportional.browser.test.ts`: each operation's DOM mutations are the same with 100 todos as with 2,000, less
  one per row it changed.
- `elements.test.ts`: element modules import nothing but each other. `build.test.ts`: the page builds.
- `app/todo.perf-browser-test.ts`, with `pnpm test:perf src/samples/todo`: times and mutation counts, logged.

## Performance

Apple M1 Max, Chromium, with other benchmarks running on the machine. Each time is a run's, its observer systems
included, the median of 21 unless it's a single pass; mutations count the page's and its shadow roots' records until
the tick after.

| Operation | 1K ms | 10K ms | Mutations |
|---|---:|---:|---:|
| Run that changes nothing | 0.030 | 0.025 | 0 |
| Toggle one | 0.15 | 0.18 | 2 |
| Edit one | 0.11 | 0.090 | 1 |
| Move last to first | 0.18 | 0.13 | 2 |
| Add one, with its row | 0.33 | 0.30 | 4 |
| Toggle all | 1.3 | 9.2 | 1 per todo, and 4 |
| Filter half the rows | 0.32 | 2.3 | 1 per row hidden, and 2 |
| Filter half the rows, laid out | 5.6 | 65 | 1 per row hidden, and 2 |
| Generate N todos | 5.4 | 7.4 | 0 |
| Create and place N rows | 17 | 90 | 3 per row |
| Lay N rows out | 21 | 138 | 0 |

Operations on one todo cost the same at 1K and 10K. Moving a row by the DOM alone takes 0.08 ms of the move's 0.13.
Once laid out, filtering costs what restyling the rows that change does.

## Not kept

- **Layers at the top**, one `data.ts`, `model.ts`, `dom.ts` and `events.ts` holding every feature's part: 27 files
  instead of 47 and half the imports, but a feature's parts are spread over four files, its tests share files with
  the others', nothing shows which feature builds on which, and removing one means editing every layer.
- **The app composing each layer of each feature**, importing every feature's DOM systems, events, element
  definitions and resource keys, and taking the fixed elements in a `Page`: the app knew every feature's insides, in
  16 imports where it now has 4.
- **Views as entities of their own**, `{ view, viewOf }`, bound through `up: { through: viewOf }`: an observer system
  can't declare `up`, so the binding became a ticking system that writes a run's change only on the next tick and a
  new view's values only on the tick after it was made, which the creating system had to write itself; and `order`
  can't go with `up`, so placing views in list order had to run over their todos. It was slower too: 107 ms instead of
  98 to create 10K rows, 0.095 ms instead of 0.080 to toggle one. Nothing here shows a todo twice.
- **Filtering by an attribute of the list**, which style sheets select rows by: one write instead of a pass over the
  rows, 0.035 ms instead of 2.3 at 10K, but no cheaper a frame, since restyling the rows dominates: 69 ms against 65
  once laid out, whether the style is the page's or the list's own. It also put the filter's meaning in the list's
  element. The pass costs about 0.2 µs a row.
- **A helper building a binding** from a map of properties to components: it can't be typed generically, since its
  keys widen and the declaration's thread check then fails, and its body has to read and write by reflection. A
  binding is four to six lines.
