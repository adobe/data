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

```
src/
  state/
    dashboard-plugin.ts        ECS plugin — resources and transactions
  components/
    control-panel.tsx           data wiring — observes count, exposes transactions
    control-panel.presentation.tsx
    counter-display.tsx         data wiring — observes count
    counter-display.presentation.tsx
    activity-log.tsx            data wiring — observes log
    activity-log.presentation.tsx
    status-bar.tsx              data wiring — observes userName, count, log
    status-bar.presentation.tsx
  app.tsx                       root component — sets up DatabaseProvider
  main.tsx                      entry point
```

## Pattern summary

```tsx
// data wiring: setup reactive graph, delegate to presentation
function CounterDisplay() {
  const db = useDatabase(dashboardPlugin);
  const count = fromObserve(db.observe.resources.count, 0);
  return presentation.render({ count });
}

// presentation: pure render, accepts accessors and callbacks
function render(args: { count: () => number }) {
  return <span>{args.count()}</span>;
}
```
