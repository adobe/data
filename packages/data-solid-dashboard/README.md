# data-solid-dashboard

Mini dashboard sample demonstrating [@adobe/data-solid](../data-solid) with
multiple components sharing a single ECS database.

## Run

```bash
pnpm install
pnpm dev        # starts Vite on http://localhost:3004
```

## What it demonstrates

- **Shared database** — one `DatabaseProvider` at the app root, consumed by
  every component via `useDatabase`.
- **Fine-grained reactivity** — each component observes only the slices it
  needs (`count`, `log`, `userName`). Updating one resource does not re-render
  components that don't depend on it.
- **Cross-component actions** — the control panel fires actions
  (`increment`, `setUserName`, …) that are reflected in the counter display,
  activity log, and status bar.
- **Presentation separation** — each component is split into a data-wiring
  file (`counter-display.tsx`) and a pure render function
  (`counter-display.presentation.tsx`). The presentation receives accessors
  and action callbacks, keeping rendering free of database concerns.

## Structure

Organized into the layered feature layout (`data → spec | ecs → ui → app`):

```
src/
  app/main.tsx                          entry point
  features/main/
    data/                               runtime: pure Data declarations
      values/activity-log/              ActivityLog type + pinned schema
      resources/                        count, userName, log (one schema per file) + index.ts
    spec/                               test tier: State + one pure action per file + its cases
      state.ts  create.ts  samples.ts  transforms.ts  spec.ts  spec.test.ts
      increment.ts  decrement.ts  reset.ts  set-user-name.ts  clear-log.ts  (+ .cases.ts)
    ecs/                                runtime: the ECS implementation
      core/  transactions/  actions/    one op per file + <layer>-database.ts
      main-service.ts                   aliases the top layer as MainService
      conformance/                      test tier: projection, implementation, conformance.test.ts
    ui/                                 Solid components (element + pure presentation)
      app/  status-bar/  control-panel/  counter-display/  activity-log/
```

Each spec action is replayed against the same-named `MainService` action via
`toState(action(fromState(before), args)) ≡ spec(before, args)`, using the inert
cases in `spec/<action>.cases.ts`.

## Pattern summary

```tsx
// data wiring: setup reactive graph, delegate to presentation
function CounterDisplay() {
  const db = useDatabase(MainService.plugin);
  const count = fromObserve(db.observe.resources.count, 0);
  return presentation.render({ count });
}

// presentation: pure render, accepts accessors and callbacks
function render(args: { count: () => number }) {
  return <span>{args.count()}</span>;
}
```
