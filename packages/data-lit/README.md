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

Hooks (`useState`, `useEffect`, `useObservable`, `useObservableValues`, `useMemo`, `useRef`, ...) follow
React's unmount semantics. When a hook-using element is disconnected from the DOM, **all of its hook state is
reset**:

- every `useEffect` cleanup runs, so observable subscriptions and event listeners are torn down, and
- all stored values (`useState`, `useMemo`, `useRef`) are discarded.

On the next connect the element renders fresh from its initial hook state.

> **Footgun:** because a disconnect is a full reset, a DOM *move* (`el.remove()` then re-appending it, or
> reparenting the element) is treated as a full unmount followed by a remount. Any local UI state held in
> hooks is silently lost across the move: toggle positions, uncontrolled input values, scroll offsets. If a
> piece of state must survive a reparent, keep it in the `@adobe/data` database/service rather than in element
> hook state.

See the `data-lit-todo` sample in this repository for a full example.
