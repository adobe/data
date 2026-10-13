import { describe, expect, it } from "vitest";
import { Component } from "../../component/component.js";
import { Entity } from "../../entity/entity.js";
import { System } from "../../system/system.js";
import { createWorld } from "./create.js";

const score = "traitsTest/score";
const slot = "traitsTest/slot";
const ready = "traitsTest/ready";
const parent = "traitsTest/parent";

declare module "../../component/types.js" {
    export interface Types {
        [score]: { type: number };
        [slot]: { type: number; derived: true };
        [ready]: { type: true; within: typeof slot };
        [parent]: { type: Entity; reference: "owner" };
    }
}
declare module "../../system/types.js" {
    export interface Types {
        "traitsTest/spawn": true;
        "traitsTest/derived": true;
        "traitsTest/cascade": true;
        "traitsTest/lookup": true;
    }
}

Component.register(score, { type: { type: "number" } });
Component.register(slot, { type: { type: "number" }, derived: true });
Component.register(ready, { type: { const: true }, within: slot });
Component.register(parent, { type: Entity.schema, reference: "owner" });

describe("traits", () => {
    it("keep derived components out of commands, for untyped callers too", async () => {
        const errors: string[] = [];
        const derived = System.create({ name: "traitsTest/derived" }, (_, __, commands) => {
            const entity = commands.spawn({ [score]: 1 });
            const attempts = [
                // @ts-expect-error derived components are added only by rules
                () => commands.spawn({ [slot]: 1 }),
                // @ts-expect-error derived components are added only by rules
                () => commands.add(entity, { [slot]: 1 }),
                // @ts-expect-error derived components are removed only by rules
                () => commands.remove(entity, slot),
            ];
            for (const attempt of attempts) {
                try { attempt(); }
                catch (error) { errors.push(error instanceof Error ? error.message : String(error)); }
            }
        });
        const world = createWorld({ workers: 0 });
        await world.systems.register(derived);
        await world.run(derived);
        expect(errors).toEqual(Array.from({ length: 3 }, () => `"${slot}" is derived, so only rules add and remove it.`));
        expect(world.query.count([score])).toBe(1);
        await world.dispose();
    });

    it("are rejected by worlds where they declare cascades", async () => {
        const cascade = System.create({ name: "traitsTest/cascade", query: { read: [parent] } }, row => { void row[parent]; });
        await expect(createWorld({ workers: 0 }).systems.register(cascade)).rejects.toThrow("which worlds don't support yet");
    });

    it("leave index 0 to Entity.none, which no lookup finds", async () => {
        let first = Entity.none;
        let found: unknown = undefined;
        const spawn = System.create({ name: "traitsTest/spawn" }, (_, __, commands) => { first = commands.spawn({ [score]: 1 }); });
        const lookup = System.create({ name: "traitsTest/lookup", lookup: { scores: { read: [score] } } }, (_, { scores }) => { found = scores(Entity.none); });
        const world = createWorld({ workers: 0 });
        await world.systems.register(spawn, lookup);
        await world.run(spawn);
        await world.run(lookup);
        expect(first).not.toBe(Entity.none);
        expect(found).toBeNull();
        expect(world.read.component(Entity.none, score)).toBeNull();
        await world.dispose();
    });
});
