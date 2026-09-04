# @adobe/data-rpc

Schema-driven, **bidirectional** projection of `@adobe/data` async data services
across a boundary — an iframe, a Worker, a `MessagePort`, anything with a
message channel. Each side can both **expose** its own services and **consume**
the peer's, over a single connection.

## The core idea

An `AsyncDataService` is fully described by a pure-JSON `Schema`, and every one
of its members is one of five shapes:

| member | schema | wire behavior |
| --- | --- | --- |
| `Observe<Data>` | `observe` | subscribe → streamed `Data` values |
| `(...Data[]) => Observe<Data>` | `function` / `observe` | args + subscribe → streamed `Data` |
| `(...Data[]) => Promise<Data \| void>` | `function` / `promise` | request → one `Data` reply |
| `(...Data[]) => AsyncGenerator<Data>` | `function` / `generator` | pull-based stream of `Data` |
| `(...Data[]) => void` | `function` (no `returns`) | fire-and-forget |

**Only `Data` ever crosses the wire.** We never serialize an `Observe`,
`Promise`, `AsyncGenerator`, or function. The consuming side *synthesizes* an
equivalent-shaped service locally whose members are thin wrappers translating
to/from `Data`-only messages. Gating `expose` on `AsyncDataService.IsValid`
guarantees there is nothing but `Data` to marshal (an `Observe` is a function,
so higher-order nesting is rejected at compile time).

**Nested services** work too: a member whose schema is a child object with its
own member `properties` is shimmed recursively on both sides (to any depth), and
each leaf is addressed by its full path from the service root — so
`remote.child.deep.greet(name)` round-trips exactly like a top-level member.

**Constructor-typed arguments** (`Observe`, `Promise`, `AsyncGenerator`) work too,
in reverse: one passed as — or nested inside — a call argument is a channel from
the *caller* to the *callee*. The caller sends a ref instead of the value and
services it over a reverse channel (an `Observe` streams on subscribe; a `Promise`
settles once; an `AsyncGenerator` is pulled by the callee); the callee reconstructs
a local value. For example, all of these round-trip:

```ts
display(foo: { alpha: Observe<number>; beta: Observe<string> }): Observe<string>
awaitAndDouble(p: Promise<number>): Promise<number>
sumStream(nums: AsyncGenerator<number>): Promise<number>
```

Describe such an argument with the matching `observe`/`promise`/`generator` schema
at that position. Providers are released when the owning call/subscription ends and
on endpoint close. (Function/callback arguments are not supported; and a `void`
member can't release constructor args, so avoid them there.)

## Define a service

A projected service is an ordinary `@adobe/data` `AsyncDataService`: an interface
of the five member shapes above, plus a sideloaded `Schema` that describes it
exactly. The schema is the single source of truth — it drives the wrapping on
both sides.

```ts
import type { Observe } from "@adobe/data/observe";
import { type Schema } from "@adobe/data/schema";
import { AsyncDataService, type Service } from "@adobe/data/service";
import type { Assert } from "@adobe/data/types";

export interface CounterService extends Service {
  count: Observe<number>;                 // observe
  add: (n: number) => Promise<number>;    // promise
  reset: () => void;                      // void
}

export namespace CounterService {
  export const schema = {
    type: "object",
    properties: {
      count: { type: "observe", value: { type: "number" } },
      add: { type: "function", signature: { parameters: [{ type: "number" }], returns: { type: "promise", value: { type: "number" } } } },
      reset: { type: "function" },
    },
    required: ["count", "add", "reset"],
    additionalProperties: false,
  } as const satisfies Schema;
}

// Compile-time guard: the schema describes the service exactly (only Data crosses).
type _Check = Assert<AsyncDataService.IsValidWithCompleteSchema<CounterService, typeof CounterService.schema>>;
```

## Usage

```ts
import { createRpcEndpoint, createMessagePortTransport } from "@adobe/data-rpc";

// Each side over one MessagePort:
const endpoint = createRpcEndpoint(createMessagePortTransport(port));

// Expose a local service (schema must exactly describe it — compile-time checked):
endpoint.expose("clock", myClockService, ClockService.schema);

// Consume the peer's service with a compile-time schema → fully typed, sync:
const remote = endpoint.consume("weather", WeatherService.schema);
remote.temperature((t) => render(t));         // observe
const forecast = await remote.forecast("NYC"); // promise
for await (const d of remote.days(7)) { … }    // generator (pull-based)
remote.refresh();                              // void

// …or fetch the schema at runtime (resolves once the peer exposes it):
const remote2 = await endpoint.consume("weather");
```

### iframe handshake

The main frame hands the iframe one end of a `MessageChannel`, then both switch
to a `MessagePort` transport:

```ts
const channel = new MessageChannel();
iframe.addEventListener("load", () =>
  iframe.contentWindow!.postMessage({ type: "port" }, origin, [channel.port2]),
);
const endpoint = createRpcEndpoint(createMessagePortTransport(channel.port1));
```

See the `data-rpc-iframe` sample for a complete main + sub frame demonstrating
all four kinds in both directions.

## Transports

- `createMessagePortTransport(port)` — the primary iframe/worker transport.
- `createWindowTransport(target, { allowedOrigins })` — `window.postMessage`, for
  the initial port handoff, with origin allowlisting.
- `createRpcLoopbackTransport()` — in-process pair for tests and single-process demos.

`RpcTransport` is a small `send`/`onMessage`/`onClose`/`close` interface; bring
your own for any other channel.

## Trust (v1)

Transport-level: origin allowlisting on the window transport, and the host only
dispatches to explicitly `expose`d services. Incoming `Data` arguments are
validated against `signature.parameters` before dispatch. A `canInvoke(service,
member)` seam (default allow) is where per-member policy — e.g.
`Schema.resolveExternalInvocation` — drops in later.

## Semantics & limitations

- **Observe first value is asynchronous** (a round-trip), unlike a local
  `Observe.fromConstant`/`createState` which notifies synchronously.
- **Generators are strictly pull-based** — the host advances one value per
  `next()`; no unbounded buffering.
- **Errors** are marshaled as `{ name, message, stack }` and reconstructed as a
  plain `Error`; the remote subclass is not preserved. A throw in a `void`
  handler has no wire channel — it is routed to the endpoint's `onError`.
- **On close**, pending promise calls reject, consumed generators end, and all
  host subscriptions/generators are released. A dropped subscription has no error
  channel through `Observe<Data>`.
- **Reconnection is out of scope** for v1 — a closed port ends all subscriptions.
