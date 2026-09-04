# data-rpc-iframe

A runnable sample for [`@adobe/data-rpc`](../data-rpc): a **main frame** embeds a
real **iframe** (the sub frame), and the two exchange async data services over a
single `MessagePort` — **in both directions**.

## Run it

```bash
pnpm --filter data-rpc-iframe dev
```

Then open http://localhost:3011/. The left column is the main frame; the right
column is the sub frame (a genuine `<iframe>`).

## What it demonstrates

Each side both **exposes** its own service and **consumes** the peer's, so every
communication kind runs in both directions:

| kind | main → sub | sub → main |
| --- | --- | --- |
| **observe** | sub renders `main.time` live | main renders `sub.status` live |
| **promise** | `sub.echo(msg)` | `main.echo(msg)` |
| **generator** | `sub.countUp(5)` (pull-based) | `main.countUp(5)` |
| **void** | `main.notify(msg)` → sub's inbox | `sub.log(msg)` → main's logs |

It also shows a **nested sub-service**: `sub.calc` (a child service with
`total`/`add`/`reset`) is shimmed recursively and driven from the main frame —
`sub.calc.add(5)` (nested promise), `sub.calc.total` (nested observe), and
`sub.calc.reset()` (nested void).

## How the wiring works

1. `main.ts` creates a `MessageChannel`, embeds `sub.html`, and on the iframe's
   `load` posts `port2` to it via `window.postMessage` (same-origin).
2. Each side wraps its port with `createMessagePortTransport`, creates a
   `createRpcEndpoint`, then `expose`s its service and `consume`s the peer's.
3. The Lit panels render reactively from the observed service state via
   `@adobe/data-lit`'s `useObservableValues`.

The service contracts live in `src/shared/`; the per-frame implementations and
panels live in `src/main/` and `src/sub/`.
