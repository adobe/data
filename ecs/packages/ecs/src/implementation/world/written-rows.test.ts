// © 2026 Adobe. MIT License. See /LICENSE for details.
import { expect, it } from "vitest";
import { System } from "../../index.js";
import { workers } from "../../interface/resources/workers.js";
import { createWorld } from "../index.js";

const look = Symbol("writtenRows/look");
const spin = Symbol("writtenRows/spin");
const loose = Symbol("writtenRows/loose");
const inTab = Symbol("writtenRows/inTab");

declare module "@adobe/ecs" {
    interface Components {
        [look]: { type: number };
        [spin]: { type: number; [inTab]: true };
        [loose]: { type: number };
    }
    export interface Traits<N> {
        readonly [inTab]: N extends unknown ? true : never;
    }
}

const spawn = System.create({}, ({ commands }) => { commands.spawn([look, spin, loose])({ [look]: 0, [spin]: 0, [loose]: 0 }); });
const turn = System.create({ components: { with: [look] } }, row => { row[look] += 1; });
const twirl = System.create({ components: { with: [spin] } }, row => { row[spin] += 1; });
const drift = System.create({ components: { with: [loose] } }, row => { row[loose] += 1; });
const idle = System.create({ components: { with: [look] } }, row => { if (row[look] < 0) row[look] = 0; });
const turnKernel = System.create({ kernel: true, components: { with: [look] } }, row => { row[look] += 1; });

/** A changes system watching `look` and the trait `inTab`, and what each of its runs saw written. */
const watcher = () => {
    const seen: (readonly string[])[] = [];
    const names = new Map<symbol, string>([[look, "look"], [spin, "spin"], [loose, "loose"]]);
    const changes = System.changes({ watch: [look, inTab] }, changes => { seen.push(changes.written.map(key => names.get(key) ?? "?").sort()); });
    return { changes, seen };
};

it("reports watched components written through rows once, by key and by trait, and not unwatched ones", async () => {
    await using world = createWorld();
    const { changes, seen } = watcher();
    world.add(changes);
    await world.run(spawn);
    seen.length = 0;
    // Its only news is row writes, so its sync point still runs.
    await world.run(turn);
    await world.run(twirl);
    await world.run(System.create([turn, twirl]));
    expect(seen).toEqual([["look"], ["spin"], ["look", "spin"]]);
    // Written once, reported once; nothing written or only unwatched ones written, no sync point is due.
    await world.run(drift);
    await world.run(idle);
    await world.run(System.create({}, () => {}));
    expect(seen).toEqual([["look"], ["spin"], ["look", "spin"]]);
});

it("reports row writes beside structural changes, and none for a command's value", async () => {
    await using world = createWorld();
    const { changes, seen } = watcher();
    world.add(changes);
    await world.run(spawn);
    await world.run(System.create([turn, spawn]));
    expect(seen).toEqual([[], ["look"]]);
});

for (const wasm of [false, true]) {
    it(`reports a ${wasm ? "WASM" : "JS"} kernel's writes`, async () => {
        await using world = createWorld({ [workers]: 0 }, { wasm });
        const { changes, seen } = watcher();
        world.add(changes);
        await world.run(spawn);
        seen.length = 0;
        await world.run(turnKernel);
        await world.run(drift);
        await world.run(turnKernel);
        expect(seen).toEqual([["look"], ["look"]]);
    });
}

it("reports nothing written to a changes system added after the writes", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(turn);
    const { changes, seen } = watcher();
    world.add(changes);
    await world.run(spawn);
    await world.run(turn);
    expect(seen).toEqual([[], ["look"]]);
});

it("leaves row writes out of a run's own changes", async () => {
    await using world = createWorld();
    await world.run(spawn);
    expect((await world.run(turn, { changes: true })).written).toEqual([]);
});
