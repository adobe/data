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
- **Cross-component actions** — the control panel fires transactions
  (`increment`, `setUserName`, …) that are reflected in the counter display,
  activity log, and status bar.
- **Presentation separation** — each component is split into a data-wiring
  file (`counter-display.tsx`) and a pure render function
  (`counter-display.presentation.tsx`). The presentation receives accessors
  and action callbacks, keeping rendering free of database concerns.

## Structure

Organized into the feature-folder architecture — layered by the *kind of type*
each folder holds (`data/` value types & pure transforms, `services/` the ECS
implementation, `ui/` presentation):

```
src/
  main.tsx                              entry point
  features/main/
    data/state/                         the spec — one immutable State + pure transforms
      state.ts  create.ts  public.ts
      increment.ts / .test.ts  decrement.ts / .test.ts  reset.ts / .test.ts
      set-user-name.ts / .test.ts  clear-log.ts / .test.ts
      conformance-case.ts  expect-state-matches.ts
    services/main-service/              the implementation — the sole entrypoint the ui/ binds to
      core-database/                    resources (count, userName, log) — no entities
      transaction-database/transactions/  one mutation per file + conformance test
      conformance/                      fromState / toState / expectConforms (test-only)
      main-service.ts                   aliases the top layer as MainService
    ui/                                 Solid components (element + pure presentation)
      app/  status-bar/  control-panel/  counter-display/  activity-log/
```

Each transaction is proven equivalent to its pure `data/` transform via
`toState(apply(fromState(before), args)) ≡ State.transform(before, args)`, reusing
the spec-owned cases exported from each `data/state/<transform>.test.ts`.

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
