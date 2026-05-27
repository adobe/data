// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Compile-time tests for `ToTransactionFunctions`.
//
// The wrapper exposes each transaction as an overloaded function:
//
//   • plain `Input`                       → returns the declared `R` (`void | Entity`)
//   • `() => Promise<Input>` factory      → returns `Promise<R>`
//   • `() => AsyncGenerator<Input>` factory → returns `Promise<R>`
//
// These tests pin both the green path (positive equalities) and the red
// path (`@ts-expect-error` on shapes the overload should reject), so a
// future regression that reverts the wrapper to a single union signature
// will immediately fail compilation.

import type { Assert } from "../../types/assert.js";
import type { Equal } from "../../types/equal.js";
import type {
    AsyncArgsProvider,
    ToAsyncTransactionFn,
    ToSyncTransactionFn,
    ToTransactionFunctions,
} from "./transaction-functions.js";
import type { Entity } from "../entity/entity.js";

// ---------------------------------------------------------------------------
// Sample declarations covering the three meaningful shapes.
// ---------------------------------------------------------------------------

type SampleDecls = {
    // No input, returns void.
    restart: (t: unknown) => void;
    // Plain object input, returns void.
    move: (t: unknown, args: { x: number; y: number }) => void;
    // Plain object input, returns Entity.
    spawn: (t: unknown, args: { kind: string }) => Entity;
};

type SampleFns = ToTransactionFunctions<SampleDecls>;

// ---------------------------------------------------------------------------
// Green: shape of each wrapped function matches the documented contract.
// ---------------------------------------------------------------------------

// No-input transactions stay as a thunk returning R unchanged.
type _RestartShape = Assert<Equal<SampleFns["restart"], () => void>>;

// Object-input transactions become an overload: async-provider first, plain
// arg second. The Promise<R> path encodes the runtime fact that the
// dispatcher's async-args branch wraps the commit in a Promise.
type _MoveShape = Assert<Equal<
    SampleFns["move"],
    {
        (arg: AsyncArgsProvider<{ x: number; y: number }>): Promise<void>;
        (arg: { x: number; y: number }): void;
    }
>>;

type _SpawnShape = Assert<Equal<
    SampleFns["spawn"],
    {
        (arg: AsyncArgsProvider<{ kind: string }>): Promise<Entity>;
        (arg: { kind: string }): Entity;
    }
>>;

// ---------------------------------------------------------------------------
// Green: call-site return inference picks the right overload.
// ---------------------------------------------------------------------------

declare const fns: SampleFns;

const _moveSync: void = fns.move({ x: 1, y: 2 });

const _moveAsyncFromPromise: Promise<void> =
    fns.move(() => Promise.resolve({ x: 1, y: 2 }));

const _moveAsyncFromGenerator: Promise<void> =
    fns.move(async function* () {
        yield { x: 1, y: 2 };
    });

const _spawnSync: Entity = fns.spawn({ kind: "particle" });

const _spawnAsync: Promise<Entity> =
    fns.spawn(() => Promise.resolve({ kind: "particle" }));

// The async overload's return is a real Promise, so chaining is allowed
// without any cast — this is the gap the overload exists to close.
fns.move(async function* () {
    yield { x: 1, y: 2 };
}).catch(() => undefined);

// ---------------------------------------------------------------------------
// Red: shapes the overload must reject.
// ---------------------------------------------------------------------------

// Plain-arg result is `void` and therefore is NOT promise-shaped. Treating
// it as a Promise would be a real bug (it would silently swallow rejections
// from the async path that the type used to wrongly allow).
// @ts-expect-error — `void` has no `.catch`.
fns.move({ x: 1, y: 2 }).catch(() => undefined);

// Wrong input shape on the sync path is still rejected.
// @ts-expect-error — missing `y`.
fns.move({ x: 1 });

// Wrong input shape inside an async provider is still rejected.
// @ts-expect-error — async path's payload must match Input.
fns.move(() => Promise.resolve({ x: 1 }));

// @ts-expect-error — generator yield must match Input.
fns.move(async function* () {
    yield { x: 1 };
});

// No-input transaction does not accept positional args.
// @ts-expect-error — restart takes no arguments.
fns.restart({ unexpected: true });

// ---------------------------------------------------------------------------
// Green: assignability into a narrowly-typed async consumer (e.g.
// `use-drag-transaction` declares `(asyncArgs: AsyncArgsProvider<T>) => void`).
// The overload's `Promise<R>` return is assignable to `void`, so existing
// consumer signatures keep accepting wrapped transactions unchanged.
// ---------------------------------------------------------------------------

type AsyncConsumer<T> = (asyncArgs: AsyncArgsProvider<T>) => void;
const _moveIsAssignable: AsyncConsumer<{ x: number; y: number }> = fns.move;

// ---------------------------------------------------------------------------
// Green: ToAsyncTransactionFn / ToSyncTransactionFn extract a single overload
// so that consumers can pass a transaction by value without copy/pasting the
// Input shape (TS only sees the *last* overload of an overloaded fn type for
// structural assignment, `Parameters`, and `ReturnType`).
// ---------------------------------------------------------------------------

type _MoveAsync = Assert<Equal<
    ToAsyncTransactionFn<SampleFns["move"]>,
    (arg: AsyncArgsProvider<{ x: number; y: number }>) => Promise<void>
>>;

type _SpawnAsync = Assert<Equal<
    ToAsyncTransactionFn<SampleFns["spawn"]>,
    (arg: AsyncArgsProvider<{ kind: string }>) => Promise<Entity>
>>;

type _MoveSync = Assert<Equal<
    ToSyncTransactionFn<SampleFns["move"]>,
    (arg: { x: number; y: number }) => void
>>;

type _SpawnSync = Assert<Equal<
    ToSyncTransactionFn<SampleFns["spawn"]>,
    (arg: { kind: string }) => Entity
>>;
