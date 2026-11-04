# @adobe/data-lit

Lit bindings for [@adobe/data](https://www.npmjs.com/package/@adobe/data): hooks, elements, and decorators
for building reactive UIs with the @adobe/data ECS database and observables.

## Install

```bash
pnpm add @adobe/data @adobe/data-lit lit
```

## Usage

```typescript
import { ApplicationHost, DatabaseElement } from "@adobe/data-lit";
import { createDatabase } from "@adobe/data/ecs";
```

## State and resize callbacks

`useState` returns a setter whose identity is stable for the lifetime of the hook state. The setter
requests a render only when `Object.is` reports that the value has changed. Lazy initializers run once
per hook state, including when the initial value is `null` or `undefined`.

Treat state objects and arrays as immutable: pass a new object or array when its contents change.
Mutating a value in place and passing the same reference to the setter does not request a render.

`useResizeObserver` keeps its observer attached across renders and invokes the latest callback.
Inline callbacks do not cause the observer to disconnect and reattach.

## Hooks and the disconnect lifecycle

A hook-using element has two kinds of hook state with different lifetimes.

**Values and subscriptions** (`useState`, `useMemo`, `useRef`, `useEffect`, `useObservable`,
`useObservableValues`, ...) belong to the element's mount. They survive a DOM *move*: removing the element
and re-inserting it in the same task, as a `repeat` reorder or a reparent does, keeps every value and
subscription, and the element renders once more. They are finalized only when the element is still
disconnected at the next microtask: every `useEffect` cleanup runs, stored values are discarded, and a
later connect renders fresh from initial hook state.

**Connectedness** (`useConnected`) follows every connect and disconnect synchronously, including both
edges of a move. Use it for window or document listeners, portals, and drag sessions that must detach while
the element is out of the DOM.

See the `data-lit-todo` sample in this repository for a full example.
