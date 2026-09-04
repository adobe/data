// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Data } from "@adobe/data";
import { marshalError } from "../host/marshal-error.js";
import type { CallerContext, CallerGenSlot, PullResult } from "./caller-context.js";

/**
 * Projects a remote async-generator member, strictly pull-based: the host does
 * not advance until this side asks. The first `next()` sends `iterate` (once),
 * then every `next()` sends one `pull` and awaits the matching
 * `yield`/`done`/`throw`. Early `return()` / `await using` disposal sends
 * `return`; a thrown `throw(e)` injects `raise` so the host generator's `finally`
 * runs. Once terminated it never resurrects (mirrors the local lazy generator).
 *
 * If the endpoint closes mid-stream the pending pull resolves `done` and further
 * `next()` calls return `done` — a graceful end (an `Observe`/generator has no
 * error channel guaranteed across a dropped transport).
 */
export function makeGenerator(
    ctx: CallerContext,
    service: string,
    path: readonly string[],
    args: readonly Data[],
): AsyncGenerator<Data> {
    const id = ctx.nextId();
    const slot: CallerGenSlot = { pulls: [] };
    ctx.callerGens.set(id, slot);

    let started = false;
    let finished = false;

    const finish = () => {
        finished = true;
        ctx.callerGens.delete(id);
    };

    const gen: AsyncGenerator<Data> = {
        async next(): Promise<IteratorResult<Data>> {
            if (finished || ctx.isClosed()) {
                finish();
                return { done: true, value: undefined };
            }
            if (!started) {
                started = true;
                ctx.send({ kind: "iterate", id, service, path, args });
            }
            ctx.send({ kind: "pull", id });
            const result = await new Promise<PullResult>((res) => slot.pulls.push(res));
            if ("error" in result) {
                finish();
                throw result.error;
            }
            if (result.done) {
                finish();
                return { done: true, value: result.value };
            }
            return { done: false, value: result.value };
        },

        async return(value?: Data): Promise<IteratorResult<Data>> {
            if (!finished) {
                const wasStarted = started;
                finish();
                if (wasStarted) ctx.send({ kind: "return", id });
            }
            return { done: true, value: value as Data };
        },

        async throw(error?: unknown): Promise<IteratorResult<Data>> {
            if (!finished) {
                const wasStarted = started;
                finish();
                if (wasStarted) ctx.send({ kind: "raise", id, error: marshalError(error) });
            }
            throw error;
        },

        [Symbol.asyncIterator]() {
            return this;
        },

        async [Symbol.asyncDispose](): Promise<void> {
            await gen.return(undefined);
        },
    };

    return gen;
}
