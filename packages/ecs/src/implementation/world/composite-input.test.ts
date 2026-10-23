// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { System } from "../../interface/system/system.js";
import { createWorld } from "./create.js";
import { workers } from "../../interface/resources/workers.js";

const seen: { readonly system: string; readonly input: unknown }[] = [];
const move = System.create({
    name: "compositeInputTest/move",
}, (_context, input: { readonly distance: number }) => { seen.push({ system: "move", input: { ...input } }); });
const step = System.create({
    name: "compositeInputTest/step",
}, (_context, input: { readonly distance: number; readonly dt: number }) => { seen.push({ system: "step", input: { ...input } }); });
const idle = System.create({ name: "compositeInputTest/idle" }, () => {});
const label = System.create({
    name: "compositeInputTest/label",
}, (_context, input: { readonly distance: string }) => { void input.distance; });

describe("composite input", () => {
    it("passes each member the fields of the run's input that it declares", async () => {
        await using world = createWorld({ [workers]: 0 });
        await world.run(System.create({ name: "compositeInputTest/frame", systems: [move, step, idle] }), { distance: 1, dt: 0.5 });
        expect(seen).toEqual([{ system: "move", input: { distance: 1 } }, { system: "step", input: { distance: 1, dt: 0.5 } }]);
    });

    it("rejects a field two members declare with different schemas, naming both", () => {
        // @ts-expect-error distance is a number in one and a string in the other
        expect(() => System.create({ name: "compositeInputTest/conflict", systems: [move, label] })).toThrow('Systems "compositeInputTest/move" and "compositeInputTest/label" declare input field "distance" with different schemas.');
    });

    it("rejects a body taking input without the schema the plugin gives from its type, as one not written in place has", () => {
        const counting = (_context: unknown, input: { readonly count: number }): void => { void input.count; };
        expect(() => System.create({ name: "compositeInputTest/unbuilt" }, counting)).toThrow('System "compositeInputTest/unbuilt" takes input, whose schema the plugin gives from the type of its body\'s parameter: write its body in place and build it with the kernel plugin.');
    });

    it("rejects an input schema that isn't an object of named fields", () => {
        const create: (...parameters: unknown[]) => unknown = System.create;
        expect(() => create({ name: "compositeInputTest/scalar" }, (_context: unknown, _input: unknown) => {}, { type: "number" })).toThrow('System "compositeInputTest/scalar": input is an object schema of named fields.');
    });
});
