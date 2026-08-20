// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Store } from "../../store/index.js";
import type { VersionEntry } from "./version-entry.js";
import { createStoreAtVersion, runUpgradeStep } from "./run-upgrade-step.js";

/**
 * A per-handler test case: populate the store at the handler's INPUT version,
 * then assert the OUTPUT after the handler runs. `setup` may return anything
 * (e.g. the entities it created) to carry into `expect`.
 */
export type UpgradeHandlerTest<T = unknown> = {
    readonly setup: (store: Store<any, any, any>) => T;
    readonly expect: (store: Store<any, any, any>, setup: T) => void;
};

/**
 * Guarantee (and run) a unit test for EVERY upgrade handler. Call it once from a
 * co-located test: it walks the history and, for each entry that has a `handler`,
 * requires a `cases[version]` — **throwing if one is missing** — then builds a
 * store at the handler's input version, runs `setup`, applies the handler via
 * `runUpgradeStep`, and runs `expect`. Add a handler without a case and this
 * fails; a case pointing at a version with no handler also fails.
 *
 * ```ts
 * it("every upgrader is tested", () => testUpgradeHandlers(versions, {
 *   4: {
 *     setup: (s) => s.ensureArchetype(["hp"]).insert({ hp: 42 }),
 *     expect: (s, e) => expect(s.read(e)?.hp).toEqual({ current: 42, max: 42 }),
 *   },
 * }));
 * ```
 */
export function testUpgradeHandlers(
    entries: readonly VersionEntry[],
    cases: Readonly<Record<number, UpgradeHandlerTest<any>>>,
): Promise<void> {
    // The COVERAGE guarantee runs SYNCHRONOUSLY (before any await) so that even a
    // non-awaited `it(() => { testUpgradeHandlers(...) })` still fails when a handler
    // is missing a case or a case points at a handler-less version.
    for (let i = 0; i < entries.length; i++) {
        if (entries[i]!.handler && cases[i] === undefined) {
            throw new Error(
                `Version ${i} has an upgrade handler but no test case — add cases[${i}] = { setup, expect } ` +
                `that populates the version-${i - 1} store and asserts the version-${i} result.`,
            );
        }
    }
    for (const key of Object.keys(cases)) {
        const i = Number(key);
        if (entries[i]?.handler === undefined) {
            throw new Error(`cases[${i}] has no matching upgrade handler (version ${i} carries no handler).`);
        }
    }
    // Then RUN each case (async: staging + handler may await).
    return (async () => {
        for (let i = 0; i < entries.length; i++) {
            if (!entries[i]!.handler) continue;
            const test = cases[i]!;
            const store = createStoreAtVersion(entries, i - 1);
            const setup = test.setup(store);
            await runUpgradeStep(entries, i, store);
            test.expect(store, setup);
        }
    })();
}
