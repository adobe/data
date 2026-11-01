// © 2026 Adobe. MIT License. See /LICENSE for details.
import { workers } from "../interface/resources/workers.js";
import { System } from "../interface/system/system.js";
import { createWorld } from "../implementation/index.js";
import type { Benchmark } from "./benchmark.js";
import { fastest } from "./suite.js";

// Eight systems over rows no entity has, each with a command its body never issues, run alone or ordered one after
// another: what orderings and the sync points they need cost a frame whose commands don't fire.

const event = Symbol("chained/event");
const note = Symbol("chained/note");
declare module "@adobe/ecs" {
    export interface Components {
        [event]: { type: true };
        [note]: { type: true };
    }
}

/** Never true, so no body issues its command. */
let firing = false;
/** Systems in each composite. */
const length = 8;
/** Runs in each timed sample. */
const runs = 100;

/** A system spawning, when firing, what each of the composite's systems matches. */
const commanding = (after: readonly System[]): System => System.create({ components: { with: [event] }, after }, (_row, { commands }) => {
    if (firing) commands.spawn([event])();
});
/** A system spawning, when firing, what none of them matches. */
const noting = (after: readonly System[]): System => System.create({ components: { with: [event] }, after }, (_row, { commands }) => {
    if (firing) commands.spawn([note])();
});
const quiet = (after: readonly System[]): System => System.create({ components: { with: [event] }, after }, () => {});

/** `length` systems made by `make`, each after the one before when `ordered`. */
const composite = (make: (after: readonly System[]) => System, ordered: boolean): System => {
    const systems: System[] = [];
    for (let k = 0; k < length; k++) {
        const previous = systems[k - 1];
        systems.push(make(ordered && previous !== undefined ? [previous] : []));
    }
    return System.create(systems);
};

const unordered = composite(commanding, false);
const chainedQuiet = composite(quiet, true);
const chainedNoting = composite(noting, true);
const chainedCommanding = composite(commanding, true);

const check = (condition: boolean, message: string): void => {
    if (!condition) throw new Error(message);
};

const timed = (system: System, tiers: number, syncs: number) => async (): Promise<number> => {
    const { tiers: scheduled } = System.describe(system);
    check(scheduled.length === tiers && scheduled.filter(tier => tier.sync !== null).length === syncs, `chained: ${scheduled.length} tiers and ${scheduled.filter(tier => tier.sync !== null).length} sync points`);
    firing = false;
    const world = createWorld({ [workers]: 0 });
    try {
        return await fastest(async () => { for (let k = 0; k < runs; k++) await world.run(system); });
    }
    finally {
        await world.dispose();
    }
};

const runBest = { bytes: 64, basis: "A run reads at least one cache line of its system's state." };

export const chainedBenchmarks: readonly Benchmark[] = [
    {
        name: "chained unordered",
        operation: "Running eight systems no entity matches, each with a command it never issues, unordered: one tier, and a sync point at the run's end that applies nothing.",
        per: "runs",
        n: runs,
        typical: [1, 1],
        best: runBest,
        run: timed(unordered, 1, 0),
    },
    {
        name: "chained quiet",
        operation: "Running eight systems no entity matches, without commands, each after the one before: eight tiers and no sync point between them, as orderings that only settle conflicts make.",
        per: "runs",
        n: runs,
        typical: [1, 1],
        best: runBest,
        run: timed(chainedQuiet, length, 0),
    },
    {
        name: "chained noting",
        operation: "Running eight systems no entity matches, each after the one before, each with a command it never issues of what none of them matches: eight tiers, no sync point between them.",
        per: "runs",
        n: runs,
        typical: [1, 1],
        best: runBest,
        run: timed(chainedNoting, length, 0),
    },
    {
        name: "chained commanding",
        operation: "Running eight systems no entity matches, each after the one before, each with a command it never issues of what the next matches: eight tiers and seven sync points that apply nothing.",
        per: "runs",
        n: runs,
        typical: [1, 1],
        best: runBest,
        run: timed(chainedCommanding, length, length - 1),
    },
];
