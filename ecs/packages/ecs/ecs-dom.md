# The ECS and the DOM

How a world drives HTML elements and web components with systems alone, with no `Observe` dependency graphs, state
management library or diffing between the ECS and the DOM. `ecs-todo-vanillajs` builds an app this way; what it
hasn't settled is under Open.

## Model

- **An element is a component value:** a declared object on `main`, typed as the element it holds, such as
  `[row]: { type: TodoRow; thread: "main" }`.
- **A binding system writes the model to the element** when the components that drive it change:

  ```ts
  System.create({ readonly: true, components: { with: [label, done, row], changed: [label, done, row] } }, entry => {
      entry[row].label = entry[label];
      entry[row].done = entry[done];
  });
  ```

  The build infers what it reads from its body. As a readonly system it issues no commands and sees each run's and
  tick's applied state. Chunk and block ticks skip unchanged rows, so its cost scales with what changed.
- **Elements know nothing about the ECS.** An element takes properties and dispatches DOM events; a property write
  that changes nothing is dropped, and it never changes a property its owner writes. So it can be tested alone, and
  any rendering library can take the place of custom elements.
- **Input goes through runs.** Events call `world.run(system, input)`; a failing run rejects, and one left unawaited is
  an unhandled rejection, which the browser logs.
- **Timing:** the default loop ticks once per `requestAnimationFrame`, so writes land before paint.

## Repeated and fixed elements

- **Repeated elements are components of the entity they show**, as the todo sample's rows are:
  - **Created** by an ordinary system over entities without one, adding it by a command; readonly systems can't issue
    commands, so it's added on the tick after the run that made the entity.
  - **Bound** by a readonly system with the element and what it shows in `changed`.
  - **Placed** by a readonly system that runs rows whose element or order changed, in list order through a sorted
    index, putting each after the one before it; `moveBefore` keeps focus where the browser has it.
  - **Removed** by a finalizer on the element component, which runs whatever ends the entity, `dispose` included, so no
    node leaks.
- **Fixed elements are resources:** each feature finds its own within the page's root as the app starts, and every
  system that uses one declares it in `resources.is`, so it's skipped in a world without it.
- **Counts and summaries** are bound by readonly systems that run only when an index's entries changed (`changed: true`
  on an index lookup).

## Constraints

- **Values that drive the DOM must be readable on `main`.** Structs and strings are, through shared memory. Other
  objects live on one thread: with the world in a worker, a component a binding reads is declared `thread: "main"`, and
  the systems that compute it run there.
- **The DOM's own state stays in the DOM:** focus, selection, scroll, a draft being typed, an editing state. Bindings
  write only what the model owns.
- **No feedback loops:** setting a property doesn't fire `input` events, and an element doesn't turn a property write
  back into a run.

## Open

- **Views as entities of their own,** `{ element, viewOf: Entity }`, for one model entity shown several times, a list
  row and a details pane: their binding systems would read the model through `up: { through: viewOf }`, which readonly
  systems can't declare yet (`followups.md`).
- **Boilerplate:** one binding system per element type and set of driving components. A helper building one from a map
  of properties to components would be a public addition.
- **Self-registering fixed elements,** which find the world through a context and add their own view on first connect,
  beside elements the ECS creates.
