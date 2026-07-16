// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Type-level tests for how {@link UIService.FromService} restricts the
 * *overloaded* transaction functions produced by `ToTransactionFunctions`.
 *
 * A transaction is exposed as a two-signature overload:
 *   { (arg: AsyncArgsProvider<Input>): Promise<R>; (arg: Input): R }
 *
 * The UI restriction must rewrite BOTH returns to `void` while preserving the
 * `AsyncArgsProvider` overload, so a UI element can still drive a live,
 * single-commit gesture (drag / slider / stream) through its restricted
 * `service` — this is exactly the signature `use-drag-transaction` consumes:
 *   (asyncArgs: AsyncArgsProvider<T>) => void
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

import type {
  AsyncArgsProvider,
  ToTransactionFunctions,
} from "../../ecs/store/transaction-functions.js";
import type { Entity } from "../../ecs/entity/entity.js";
import type { Assert } from "../../types/assert.js";
import type { Service } from "../service.js";
import { UIService } from "./ui-service.js";

// The overloaded shapes a set of transactions is exposed as.
type Txns = ToTransactionFunctions<{
  move: (t: unknown, input: { readonly x: number }) => void;
  spawn: (t: unknown, input: { readonly kind: string }) => Entity;
  restart: (t: unknown) => void;
}>;

// A backend-shaped service that must be restricted before UI consumption
// (the `loadAll` Promise guarantees it is not already UI-valid).
interface DragBackend extends Service {
  readonly transactions: Txns;
  readonly loadAll: () => Promise<void>;
}

type Restricted = UIService.FromService<DragBackend>;
type RMove = Restricted["transactions"]["move"];
type RSpawn = Restricted["transactions"]["spawn"];

// The consumer signature `use-drag-transaction` requires.
type DragConsumer<T> = (asyncArgs: AsyncArgsProvider<T>) => void;

declare const rmove: RMove;
declare const rspawn: RSpawn;

// (1) RED before fix: the restricted transaction must keep its
//     AsyncArgsProvider overload so it can drive a live drag transaction.
const _moveDrivable: DragConsumer<{ readonly x: number }> = rmove;
const _spawnDrivable: DragConsumer<{ readonly kind: string }> = rspawn;

// (2) The plain-args (fire-and-forget commit) overload also survives.
const _moveCommit: (arg: { readonly x: number }) => void = rmove;

// (3) Both overloads return void — a UI consumer can never await the commit.
const _moveAsyncVoid: void = rmove(async function* () {
  yield { x: 1 };
});
const _moveSyncVoid: void = rmove({ x: 1 });

// (4) Idempotency: the restricted surface is itself a valid UI service.
type _RestrictedIsValid = Assert<UIService.IsValid<Restricted>>;

// (5) RED before fix: a raw transaction exposes an awaitable Promise overload
//     and therefore must NOT qualify as a valid UI service on its own.
interface RawTxnOnly extends Service {
  readonly move: Txns["move"];
}
// @ts-expect-error raw transaction's AsyncArgsProvider overload returns Promise
type _RejectRawTransaction = Assert<UIService.IsValid<RawTxnOnly>>;
