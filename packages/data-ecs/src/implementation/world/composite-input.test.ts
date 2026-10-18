import { describe, expect, it } from "vitest";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";

const seen: { readonly system: string; readonly input: unknown }[] = [];
const move = System.create({
    name: "compositeInputTest/move",
    input: { type: "object", properties: { distance: { type: "number" } } },
}, ({ input }) => { seen.push({ system: "move", input: { ...input } }); });
const step = System.create({
    name: "compositeInputTest/step",
    input: { type: "object", properties: { distance: { type: "number" }, dt: { type: "number" } } },
}, ({ input }) => { seen.push({ system: "step", input: { ...input } }); });
const idle = System.create({ name: "compositeInputTest/idle" }, () => {});
const label = System.create({
    name: "compositeInputTest/label",
    input: { type: "object", properties: { distance: { type: "string" } } },
}, ({ input }) => { void input.distance; });

describe("composite input", () => {
    it("passes each member the fields of the run's input that it declares", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(System.composite({ name: "compositeInputTest/frame", systems: [move, step, idle] }), { distance: 1, dt: 0.5 });
        expect(seen).toEqual([{ system: "move", input: { distance: 1 } }, { system: "step", input: { distance: 1, dt: 0.5 } }]);
    });

    it("rejects a field two members declare with different schemas, naming both", () => {
        // @ts-expect-error distance is a number in one and a string in the other
        expect(() => System.composite({ name: "compositeInputTest/conflict", systems: [move, label] })).toThrow('Systems "compositeInputTest/move" and "compositeInputTest/label" declare input field "distance" with different schemas.');
    });

    it("rejects an input that isn't an object of named fields, for untyped declarations", () => {
        // @ts-expect-error input is an object schema
        expect(() => System.create({ name: "compositeInputTest/scalar", input: { type: "number" } }, () => {})).toThrow('System "compositeInputTest/scalar": input is an object schema of named fields.');
    });
});
