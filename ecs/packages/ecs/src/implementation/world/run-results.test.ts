// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Index, System, World, always, workers } from "../../index.js";
import { createWorld } from "./create.js";
import { collect } from "./lifetime.test-helper.js";
import { catchOutOfBand, followTicks, runRan } from "./outcomes.test-helper.js";

const amount = Symbol("runResultsTest/amount");
const serial = Symbol("runResultsTest/serial");
const gate = Symbol("runResultsTest/gate");
const level = Symbol("runResultsTest/level");
const frames = Symbol("runResultsTest/frames");
declare module "@adobe/ecs" {
    interface Components {
        [amount]: { type: number };
        [serial]: { type: number };
    }
    interface Resources {
        [level]: { type: number };
        [frames]: { type: number };
        [gate]: { type: boolean; default: false };
    }
}

const inline = () => World.create({ [workers]: 0 });

const spawn = System.create(({ commands }) => {
    commands.spawn([amount])({ [amount]: 1 });
});
const raise = System.create(({ resources }) => {
    resources[level] += 1;
});
const count = System.create({ readonly: true, components: { with: [amount] } }, () => {
    counted++;
});
let counted = 0;
const readLevel = System.create({ readonly: true }, ({ resources }) => resources[level]);
const broken = System.create(() => {
    throw new Error("broken");
});
const alsoBroken = System.create(() => {
    throw new TypeError("also broken");
});

describe("a run", () => {
    it("resolves to its per-run body's value: a one-off read is an observer system returning it", async () => {
        await using world = inline();
        await world.run(raise);
        expect(await world.run(readLevel)).toBe(1);
        expect(await world.run(System.create(({ resources }) => ({ doubled: resources[level] * 2 })))).toEqual({ doubled: 2 });
        expect(await world.run(System.create({}, (_context, input: { readonly by: number }) => input.by + 1), { by: 2 })).toBe(3);
    });

    it("resolves to nothing for row systems, composites and bodies returning nothing, and for a skipped body", async () => {
        await using world = inline();
        await world.run(spawn);
        expect(await world.run(System.create({ components: { with: [amount] } }, row => row[amount]))).toBeUndefined();
        expect(await world.run(System.create([readLevel, raise]))).toBeUndefined();
        expect(await world.run(raise)).toBeUndefined();
        const whenChanged = System.create({ readonly: true, resources: { changed: [level] } }, ({ resources }) => resources[level]);
        expect(await world.run(whenChanged)).toBe(2);
        // Unchanged since it last ran: skipped.
        expect(await world.run(whenChanged)).toBeUndefined();
    });

    it("rejects once its sync point applied, keeping what succeeded, with an Error naming the system and its cause", async () => {
        await using world = inline();
        counted = 0;
        const thrown = await world.run(System.create([spawn, broken, count])).then(() => null, (error: unknown) => error);
        expect(thrown).toBeInstanceOf(Error);
        if (!(thrown instanceof Error)) return;
        expect(thrown.message).toContain(`System "broken"`);
        expect(thrown.message).toContain("broken");
        expect(thrown.cause).toBeInstanceOf(Error);
        expect(thrown.cause instanceof Error && thrown.cause.message).toBe("broken");
        // The spawn applied, and the run's observer system saw it before it rejected.
        expect(counted).toBe(1);
        await world.run(count);
        expect(counted).toBe(2);
    });

    it("names each failure when several systems failed, and the systems skipped after them", async () => {
        await using world = inline();
        const after = System.create({ after: [broken, alsoBroken] }, () => {});
        const thrown = await world.run(System.create([broken, alsoBroken, after])).then(() => null, (error: unknown) => error);
        expect(thrown).toBeInstanceOf(AggregateError);
        if (!(thrown instanceof AggregateError)) return;
        expect(thrown.message).toContain(`System "broken"`);
        expect(thrown.message).toContain(`System "alsoBroken"`);
        expect(thrown.message).toContain(`"after"`);
        expect(thrown.errors.map((error: Error) => error.cause instanceof Error ? error.cause.message : null).sort()).toEqual(["also broken", "broken"]);
    });

    it("rejects when its own observer system fails, and reports one added out of band", async () => {
        using reported = catchOutOfBand();
        await using world = inline();
        const failingObserver = System.create({ readonly: true }, () => {
            throw new Error("observer failed");
        });
        await expect(world.run(failingObserver)).rejects.toThrow(/observer failed/);
        expect(reported.errors).toEqual([]);
        world.add(failingObserver);
        // A run of another system resolves, its pass's failure out of band.
        await world.run(raise);
        expect(reported.errors.map(error => error.message)).toEqual([`System "failingObserver" failed: observer failed`]);
        // Reported once while it keeps failing.
        await world.run(raise);
        expect(reported.errors).toHaveLength(1);
    });
});

describe("ticks", () => {
    it("report a failing system out of band once while it keeps failing, and again after it ran without failing", async () => {
        using reported = catchOutOfBand();
        await using world = World.create({ [workers]: 0, [always]: true });
        let failing = true;
        let ran = 0;
        const flaky = System.create(({ resources }) => {
            ran++;
            resources[frames] += 1;
            if (failing) throw new Error("flaky");
        });
        const waitFor = async (runs: number): Promise<void> => {
            while (ran < runs) await new Promise(resolve => setTimeout(resolve, 1));
        };
        world.add(flaky);
        await reported.count(1);
        const failed = ran;
        await waitFor(failed + 3);
        expect(reported.errors).toHaveLength(1);
        expect(reported.errors[0].message).toBe(`System "flaky" failed: flaky`);
        failing = false;
        await waitFor(ran + 2);
        failing = true;
        await reported.count(2);
        expect(reported.errors[1].message).toBe(`System "flaky" failed: flaky`);
        world.remove(flaky);
    });
});

const nothing = System.create(() => {});
const bySerial = Index.create({ key: [serial], unique: true });
const spawnTwins = System.create(({ commands }) => {
    commands.spawn([serial])({ [serial]: 1 });
    commands.spawn([serial])({ [serial]: 1 });
});
const findTwin = System.create({ readonly: true, lookup: { twins: { index: bySerial } } }, ({ lookup }) => lookup.twins(1)?.entity ?? null);
const setGate = System.create({}, ({ resources }, input: { readonly open: boolean }) => {
    resources[gate] = input.open;
});
/** A value a body made, held weakly, to tell whether the world still holds it. */
const made: { ref: WeakRef<object> | null; made: boolean } = { ref: null, made: false };
const makes = System.create(() => {
    const value = { rows: new Array(1000).fill(0) };
    made.ref = new WeakRef(value);
    made.made = true;
    return value;
});

/** Whether the last value `makes` made is still held. */
const stillHeld = (): boolean => made.ref?.deref() !== undefined;

/** Settles `promise`, or gives "timed out" once `milliseconds` pass. */
const within = <T>(promise: Promise<T>, milliseconds: number): Promise<T | "timed out"> =>
    Promise.race([promise, new Promise<"timed out">(resolve => setTimeout(() => resolve("timed out"), milliseconds))]);

describe("a failing run", () => {
    it("is an unhandled rejection when nobody awaits it, once, though a run follows it", async () => {
        const listeners = process.listeners("unhandledRejection");
        process.removeAllListeners("unhandledRejection");
        const unhandled: unknown[] = [];
        const record = (reason: unknown): void => { unhandled.push(reason); };
        process.on("unhandledRejection", record);
        try {
            await using world = inline();
            void world.run(broken);
            await world.run(raise);
            await new Promise(resolve => setTimeout(resolve, 20));
            expect(unhandled.map(String)).toEqual([expect.stringMatching(/System "broken" .*failed: broken$/)]);
        }
        finally {
            process.off("unhandledRejection", record);
            for (const listener of listeners) process.on("unhandledRejection", listener);
        }
    });

    it("rejects for a unique index's conflict its own observer pass found", async () => {
        using reported = catchOutOfBand();
        await using world = inline();
        await expect(world.run(System.create([spawnTwins, findTwin]))).rejects.toThrow(/Index "bySerial" is unique/);
        expect(reported.errors).toEqual([]);
    });
});

describe("a failing run's Error", () => {
    it("names the systems skipped after the failure, its message as thrown", async () => {
        await using world = inline();
        const stops = System.create(() => {
            throw new Error("Stopped here.");
        });
        const afterStop = System.create({ after: [stops] }, () => {});
        await expect(world.run(System.create([stops, afterStop]))).rejects.toThrow(/^System "stops" failed: Stopped here\.; skipped: "afterStop"$/);
    });
});

describe("a run's observer pass", () => {
    it("fails the run for its own observer system, and reports one added out of band, in one run", async () => {
        using reported = catchOutOfBand();
        await using world = inline();
        const ownFails = System.create({ readonly: true }, () => {
            throw new Error("own failed");
        });
        const addedFails = System.create({ readonly: true }, () => {
            throw new Error("added failed");
        });
        world.add(addedFails);
        await expect(world.run(System.create([raise, ownFails]))).rejects.toThrow(/^System "ownFails" failed: own failed$/);
        expect(reported.messages()).toEqual([`System "addedFails" failed: added failed`]);
        // What the run's systems did applied.
        expect(await world.run(readLevel)).toBe(1);
    });
});

describe("a body returning a promise", () => {
    it("fails its system, never awaited, so later runs and ticks go on", async () => {
        await using world = inline();
        // @ts-expect-error a body returns no promise
        const waits = System.create(() => new Promise<number>(() => {}));
        const thenable = System.create(() => ({ then: (resolve: (value: number) => void) => resolve(1) }));
        expect(String(await within(world.run(waits).then(() => "resolved", (error: unknown) => error), 1000))).toMatch(/System "waits" failed: its body returned a promise/);
        expect(String(await within(world.run(thenable).then(() => "resolved", (error: unknown) => error), 1000))).toMatch(/System "thenable" failed: its body returned a promise/);
        await world.run(raise);
        expect(await world.run(readLevel)).toBe(1);
    });
    it("fails a row system at its first row, its promise never awaited", async () => {
        await using world = inline();
        await world.run(spawn);
        await world.run(spawn);
        let rows = 0;
        // Not async, which the build refuses, but returning a promise all the same.
        const started = (): Promise<void> => Promise.resolve();
        // @ts-expect-error a body returns no promise, a row system's neither
        const eachRow = System.create({ components: { with: [amount] } }, () => {
            rows++;
            return started();
        });
        expect(String(await within(world.run(eachRow).then(() => "resolved", (error: unknown) => error), 1000))).toMatch(/System "eachRow" failed: its body returned a promise/);
        expect(rows).toBe(1);
        await world.run(raise);
        expect(await world.run(readLevel)).toBe(1);
    });
});

describe("out-of-band reports", () => {
    it("aren't made again for a system skipped between its failures", async () => {
        using reported = catchOutOfBand();
        await using world = inline();
        const failsWhenChanged = System.create({ readonly: true, resources: { changed: [level] } }, () => {
            throw new Error("changed failed");
        });
        world.add(failsWhenChanged);
        for (let k = 0; k < 3; k++) {
            // Changed, so it runs and fails; then unchanged, so it's skipped.
            await world.run(raise);
            await world.run(nothing);
        }
        expect(reported.messages()).toEqual([expect.stringMatching(/^System "failsWhenChanged" failed: changed failed$/)]);
    });

    it("aren't made again for a tick system its condition skipped between its failures", async () => {
        using reported = catchOutOfBand();
        await using world = createWorld({ [workers]: 0, [always]: true });
        let ran = 0;
        const gated = System.create({ resources: { is: [gate] } }, () => {
            ran++;
            throw new Error("gated failed");
        });
        const ticks = followTicks(world);
        world.add(gated);
        for (let k = 0; k < 3; k++) {
            const before = ran;
            await world.run(setGate, { open: true });
            while (ran === before) await new Promise(resolve => setTimeout(resolve, 1));
            await world.run(setGate, { open: false });
            const seen = ticks.seen.length;
            while (ticks.seen.length < seen + 2) await new Promise(resolve => setTimeout(resolve, 1));
        }
        ticks.stop();
        world.remove(gated);
        expect(reported.messages()).toEqual([expect.stringMatching(/^System "gated" failed: gated failed$/)]);
    });

    it("are made for runs queued before dispose, which waits for them", async () => {
        using reported = catchOutOfBand();
        const world = inline();
        let failing = false;
        const failsAdded = System.create({ readonly: true }, () => {
            if (failing) throw new Error("added failed");
        });
        world.add(failsAdded);
        await world.run(nothing);
        failing = true;
        const ran = world.run(nothing);
        await world.dispose();
        await ran;
        expect(reported.messages()).toEqual([expect.stringMatching(/^System "failsAdded" failed: added failed$/)]);
    });

    it("aren't made again for a tick system skipped after an earlier tier failed between its failures", async () => {
        using reported = catchOutOfBand();
        await using world = createWorld({ [workers]: 0, [always]: true });
        let firsts = 0;
        // The second runs in a later tier, skipped whenever the first fails.
        const first = System.create(({ resources }) => {
            resources[frames] += 1;
            if (++firsts % 2 === 0) throw new Error("first failed");
        });
        const second = System.create({ after: [first] }, ({ resources }) => {
            resources[frames] += 1;
            throw new Error("second failed");
        });
        const both = System.create({ systems: [first, second] });
        const ticks = followTicks(world);
        world.add(both);
        await ticks.until(() => ticks.seen.length >= 12);
        ticks.stop();
        world.remove(both);
        expect(reported.messages().filter(message => message.includes("second failed"))).toHaveLength(1);
    });

    it("aren't made again for a row system whose change filter passed no row between its failures", async () => {
        using reported = catchOutOfBand();
        await using world = inline();
        const failsOnChange = System.create({ readonly: true, components: { with: [amount], changed: [amount] } }, () => {
            throw new Error("row failed");
        });
        const bump = System.create({ components: { with: [amount] } }, row => {
            row[amount] += 1;
        });
        world.add(failsOnChange);
        // Spawned, so its row passes; then nothing changed, so no row does.
        await world.run(spawn);
        for (let k = 0; k < 2; k++) {
            await world.run(nothing);
            await world.run(bump);
        }
        expect(reported.messages()).toEqual([expect.stringMatching(/^System "failsOnChange" failed: row failed$/)]);
    });
});

describe("what a run gathers for tests", () => {
    it("counts what it ran, and where", async () => {
        await using world = createWorld({ [workers]: 0 });
        expect(await runRan(world, System.create([nothing, raise]))).toEqual({ systems: 2, workers: 0, joined: 0, main: true, gpu: false });
        expect(await runRan(world, readLevel)).toEqual({ systems: 0, workers: 0, joined: 0, main: false, gpu: false });
    });
});

describe("a value a body returned", () => {
    it("isn't held once its run is done, for a composite's member or a tick's", async () => {
        await using world = createWorld({ [workers]: 0, [always]: true });
        await world.run(System.create([makes, raise]));
        await collect();
        expect(stillHeld()).toBe(false);
        made.made = false;
        world.add(makes);
        while (!made.made) await new Promise(resolve => setTimeout(resolve, 1));
        world.remove(makes);
        // Queued after the tick that ran it.
        await world.run(raise);
        await collect();
        expect(stillHeld()).toBe(false);
    });
});
