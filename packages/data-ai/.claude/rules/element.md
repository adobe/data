---
paths:
  - 'packages/**/*-element.ts'
---

# Container element authoring

A *container element* is a UI element whose only job is to bridge an
ECS / data service to a pure presentation function: subscribe to state,
hand it down, wire actions back up. It owns no business logic.

This rule is framework-agnostic. The framework-specific bindings are in
the table at the bottom.

> **Out of scope:** sibling `*presentation.ts`, `*.css.ts`, `*.test.ts`,
> and `*.stories.ts` files in the same folder are governed by their own
> rules. Pure UI primitives that take all of their inputs through props
> (no service subscription) are not container elements either.

## The discipline

A container element fits on screen. Its body contains:

1. Optional styles assignment.
2. Zero or more locator-shaped inputs (`entityId`, `userId`, `route`)
   that identify *where* to load this instance's data.
3. One subscription read of the bound data service.
4. Action callbacks — one-line invocations of service transactions or
   actions, never logic.
5. One delegation to the matching presentation function.

That is the entire surface. No internal state, no event handlers, no
lifecycle overrides, no derivation math, no timers, no event emitters,
no broadcast channels, no synchronous data reads.

### Bootstrap exception

A *bootstrap container* — one that constructs its service rather than
consuming a pre-existing one (e.g. an element that owns a WebRTC
handshake before mounting a child app) — may also accept dependency-
injection props that configure that construction (the plugin to use,
a child tag name, mapping functions). Those props feed a sibling
controller invoked from a `useMemo` / `useEffect` hook; they never
appear inside render branching. Use sparingly.

### Imperative / canvas containers

A container whose "presentation" is an imperative surface (a `<canvas>` /
WebGL context) can't render reactively — a real-time feature mutates
component columns in place each frame, which fires no observers. Such a
container may:

- run a `requestAnimationFrame` draw loop inside a `useEffect` (cancelled in
  its cleanup) that reads the live store synchronously and calls a pure
  `draw(ctx, scene)`;
- read the **full** database for those reads via the base class's protected
  accessor (`this.database` on a Lit `DatabaseElement`) — never cast the
  restricted `service` back to the full surface;
- hold ephemeral input-hardware state (a held-key `useRef`, pointer state)
  gathered by `useWindowEvent` and forwarded to a transaction.

The discipline still holds otherwise: no game/derivation logic (it lives in
`data/` and systems), the draw function is pure, and the reactive HUD around
the canvas is a normal subscribe-and-delegate presentation.

## Subscription reads must be raw

Each value in the subscription block is a direct read of a service
observable or computed — no `.map`, `.filter`, no inline composition.
If derivation is needed, it lives as a service computed; if used only
by this element, define the computed in a sibling file and import it.

## Action callbacks are one-liners

Each callback assembles arguments and invokes one service action or
transaction. No clamping, normalisation, branching, or shape-building.
Logic belongs in the action / transaction layer.

Transactions and actions are pure, already-bound functions — when a
callback would just forward the same arguments to one of them, pass the
function **by reference**, don't wrap it in an identity arrow:

```ts
// ❌ identity wrapper — adds nothing
setOperation: (op) => this.service.transactions.setOperation(op),
// ✅ same signature, pass it through
setOperation: this.service.transactions.setOperation,
```

Only write an arrow when you genuinely adapt the call (drop an event
arg, reorder, supply a captured locator).

## Lifecycle goes through hooks

Mount / unmount / update behaviour routes through a hook abstraction
(`useEffect`, `useFocus`, etc.) called inside the render body — never
through a framework lifecycle method (`connectedCallback`, `componentDidMount`,
`onMount`).

## Action returns are not consumed

Actions are fire-and-forget. If a caller needs a result, that's a
transaction the binding invokes directly, *or* a new observable to
subscribe to — never a return value awaited in render.

## Deletion test

Strip the file to its essentials. What remains should be: optional
styles, locator props, one subscription call, callbacks, and one render
delegation. Anything else is a violation — find the missing computed,
transaction, or hook.

## Framework bindings

| Framework | Container is             | Subscription hook     | Locator inputs       | Render delegation                                |
| --------- | ------------------------ | --------------------- | -------------------- | ------------------------------------------------ |
| Lit       | `DatabaseElement<P>`     | `useObservableValues` | `@property` only     | `presentation.render({ ...values, ...callbacks })` |
| React     | function component       | `useObservableValues` | function arguments   | `<Presentation {...values} {...callbacks} />`    |
| Solid     | component function       | framework-specific    | function arguments   | `<Presentation {...values} {...callbacks} />`    |

Lit-only: `static styles = styles` from a sibling `*.css.ts`. `@property`
exists *only* for locator inputs — never for state, never for derived
values, never for parent-forwarded flags.
