// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, expect, it } from "vitest";
import { Entity } from "../entity/entity.js";
import { definitionOf, firstItemOf, idOrNull, requireDefinition, sameItem, scheduleOf, threadOf } from "../registry/index.js";
import { giveAccess, identify } from "../registry/ids.test-helper.js";
import { clock, gpuDevice } from "../resources/index.js";
import { System } from "./system.js";
import { createResolved } from "./create-resolved.js";
import type { F32 } from "../math/index.js";

const position = Symbol("typesSystemTest/position");
const label = Symbol("typesSystemTest/label");
const node = Symbol("typesSystemTest/node");
const document = Symbol("typesSystemTest/document");
const time = Symbol("typesSystemTest/time");
// Never declared, so never registered.
const unregistered = Symbol("typesSystemTest/unregistered");
const parent = Symbol("typesSystemTest/parent");
const total = Symbol("typesSystemTest/total");
const paused = Symbol("typesSystemTest/paused");
const height = Symbol("typesSystemTest/height");
const tags = Symbol("typesSystemTest/tags");

declare module "@adobe/ecs" {
    export interface Components {
        [position]: { type: number };
        [label]: { type: string };
        [node]: { type: HTMLElement; thread: "main" };
        [parent]: { type: Entity; reference: "weak" };
        [height]: { type: F32 };
        [tags]: { type: readonly string[] };
    }
    export interface Resources {
        [document]: { type: Document | null; thread: "main" };
        [time]: { type: number };
        [total]: { type: number; reduce: "+" };
        [paused]: { type: boolean };
    }
}


/** Creates a system of a declaration as the world takes it, what its body reads and writes listed, bypassing the types' checks. */
const create = (declaration: object): unknown => Reflect.apply(createResolved, undefined, [declaration, () => {}]);
/** As the plugin calls it for a body taking input: with the schema of its input after the body. */
const createTaking = (declaration: object, input: unknown): unknown => Reflect.apply(createResolved, undefined, [declaration, (_context: unknown, _input: unknown) => {}, input]);

describe("System.create", () => {
    it("records the system, its value holding its declaration and body", () => {
        const body = (): void => {};
        // A body the build doesn't see is given what it uses.
        const move = System.create(giveAccess({ components: { with: [position] } }, { write: [position], resources: { read: [time] } }), body);
        expect(definitionOf(move)).toEqual({ kind: "system", name: "move", declaration: { components: { write: [position] }, resources: { read: [time] } }, body });
        expect(move.name).toBe("move");
        expect(definitionOf({ name: "move" })).toBe(undefined);
    });
    it("labels each system by the binding or function it's made in, however many share the label", () => {
        const twice = (): System => System.create({ components: { with: [position] } }, row => { void row[position]; });
        const [first, again] = [twice(), twice()];
        expect(sameItem(first, again)).toBe(false);
        expect([first.name, again.name, idOrNull(first)]).toEqual(["twice", "twice", null]);
        expect(scheduleOf(requireDefinition(System.create({ systems: [first, again] }))).tiers.flat()).toEqual([first, again]);
    });
    it("labels a system by the binding of its id, which reports give beside it, and takes a declaration of a registered id, the same, as the same system", () => {
        const [first, elsewhere, again] = ["a.ts#linked", "b.ts#linked", "a.ts#linked"].map(id => System.create(identify({ components: { with: [position] } }, id), () => {}));
        expect([first?.name, elsewhere?.name, first === undefined ? null : idOrNull(first)]).toEqual(["linked", "linked", "a.ts#linked"]);
        expect(again).not.toBe(first);
        expect(first !== undefined && again !== undefined && elsewhere !== undefined ? [sameItem(first, again), sameItem(first, elsewhere), firstItemOf(again)] : null).toEqual([true, false, first]);
        expect(() => ["a.ts#linked"].map(id => System.create(identify({ components: { with: [position], changed: [position] } }, id), () => {}))).toThrow('Cannot declare "linked" (a.ts#linked): its id is another item\'s, with another declaration; if a module was evaluated again with a changed declaration, reload the page.');
        expect(() => ["a.ts#linked"].map(id => first === undefined ? null : System.create(identify({ systems: [first] }, id)))).toThrow("its id is a system's");
    });
    it("labels a system made with neither an id nor a binding by its kind numbered", () => {
        const body = ({ commands }: { readonly commands: System.Commands }): void => { commands.spawn([position])({ [position]: 0 }); };
        const [alone] = [System.create(giveAccess(identify(body, "setup.ts#spawnOnce")))];
        expect(definitionOf(alone)).toEqual({ kind: "system", name: "spawnOnce", declaration: {}, body });
        const [first, second] = [System.create(() => {}), System.create({ systems: [alone] })].map(system => system.name);
        const number = Number(first?.slice("system #".length));
        expect([first, second]).toEqual([`system #${number}`, `system #${number + 1}`]);
        expect([System.render({ shader: { accessors: {} } }, () => {})].map(system => system.name)).toEqual([`system #${number + 2}`]);
        expect(() => create({ components: { read: [position], write: [position] } })).toThrow(`lists "typesSystemTest/position" in both components read and write`);
    });
    it("rejects writing what only the world writes, for untyped callers", () => {
        expect(() => create({ resources: { write: [clock] } })).toThrow(`writes "clock", which only the world writes`);
    });
    it("rejects what types reject, for untyped callers", () => {
        expect(() => create({ components: { read: [position], write: [position] } })).toThrow("in both components read and write");
        expect(() => create({ resources: { read: [time], write: [time] } })).toThrow("in both resources read and write");
        expect(() => create({ components: { write: [position] }, lookup: { others: { read: [position] } } })).toThrow('lookup "others" reads "typesSystemTest/position", which the system writes');
        expect(() => createTaking({}, { type: "number" })).toThrow("input is an object schema of named fields");
    });
    it("rejects at creation what the registry rules out, for untyped callers", () => {
        const rejected: readonly (readonly [object, string])[] = [
            [{ components: { read: [position], has: [unregistered] } }, `uses component "typesSystemTest/unregistered", which isn't a registered component`],
            [{ components: { read: [position] }, lookup: { others: { read: [position], not: [unregistered] } } }, `uses component "typesSystemTest/unregistered", which isn't a registered component`],
            [{ components: { read: [position] }, lookup: { others: { read: [position], changed: [height] } } }, `lookup "others" watches "typesSystemTest/height", which it neither reads nor has`],
            [{ components: { write: [parent] } }, `writes "typesSystemTest/parent", a reference, which changes only through commands`],
            [{ components: { has: [position] }, resources: { reduce: [time] } }, `reduces "typesSystemTest/time", which has no reduce trait`],
            [{ resources: { write: [total] } }, `writes "typesSystemTest/total", which is reduced`],
            [{ components: { has: [position] }, resources: { read: [total], reduce: [total] } }, `reduces "typesSystemTest/total", so it can't also read, write or filter on it`],
            [{ resources: { is: [time] } }, `runs on the condition of "typesSystemTest/time", which is never null or false`],
            [{ resources: { not: [position] } }, `runs on the condition of "typesSystemTest/position", which isn't a registered resource`],
            [{ resources: { is: [paused], not: [paused] } }, `lists "typesSystemTest/paused" in both resources is and not`],
            [{ resources: { is: [paused], read: [paused] } }, `lists "typesSystemTest/paused" in resources is and in read or write; is already makes it readable`],
            [{ components: { write: [position] }, up: { through: position, read: [position] } }, `up.through "typesSystemTest/position" isn't a reference component`],
            [{ up: { through: parent } }, "uses up, which orders rows, without components"],
            [{ kernel: "gpu", components: { write: [position], changed: [position] } }, "can't run on the GPU: GPU kernels don't support change filters yet"],
            [{ kernel: "gpu", components: { read: [position] }, lookup: { others: { read: [position] } } }, "can't run on the GPU: GPU kernels don't support lookups yet"],
            [{ kernel: "gpu", components: { has: [position] }, resources: { reduce: [total] } }, "can't run on the GPU: GPU kernels don't support reductions yet"],
            [{ observer: false, resources: { read: [time] } }, "observer is true or left out"],
            [{ observer: true, components: { write: [position] } }, "is an observer, so it writes nothing"],
            [{ observer: true, resources: { write: [time] } }, "is an observer, so it writes nothing"],
            [{ observer: true, components: { has: [position] }, resources: { reduce: [total] } }, "is an observer, so it reduces into nothing"],
            [{ observer: true, kernel: true, components: { read: [position] } }, "is an observer, so it isn't a kernel"],
            [{ observer: true, components: { read: [position] }, up: { through: parent } }, "is an observer, so it has no up"],
            [{ observer: true, resources: { read: [time] }, after: [System.create(() => {})] }, "is an observer, so it is ordered with nothing"],
            [{ observer: true, resources: { read: [time] }, before: [System.create(() => {})] }, "is an observer, so it is ordered with nothing"],
            [{ observer: true, resources: { read: [time] }, during: [System.create(() => {})] }, "is an observer, so it is ordered with nothing"],
        ];
        expect(() => createTaking({ observer: true }, { type: "object", properties: {} })).toThrow("is an observer, so it takes no input");
        rejected.forEach(([declaration, message], index) => {
            expect(() => create({ ...declaration })).toThrow(message);
        });
    });
    it("derives its thread from its object components and resources, and rejects two", () => {
        const show = System.create({ components: { with: [position, node] } }, (row, { resources }) => { row[node].textContent = `${row[position]} ${resources[time]} ${resources[document]?.title}`; });
        const count = System.create({ components: { with: [tags, node] } }, row => { void row[tags]; });
        const tick = System.create({ components: { with: [position] } }, row => { row[position] += 1; });
        const leaves = [show, count, tick].map(system => definitionOf(system));
        expect(leaves.map(leaf => leaf === undefined || leaf.kind === "composite" ? undefined : threadOf(leaf.declaration, "System", leaf.name))).toEqual(["main", "world", null]);
        expect(() => create({ components: { read: [tags], write: [node] } })).toThrow('uses "typesSystemTest/tags" on "world" and "typesSystemTest/node" on "main"');
        expect(() => create({ components: { read: [tags] }, resources: { is: [document] } })).toThrow('uses "typesSystemTest/tags" on "world" and "typesSystemTest/document" on "main"');
        // A string lives in shared memory, so it goes with any thread's objects.
        const caption = System.create({ components: { with: [label, node] } }, row => { row[node].textContent = row[label]; });
        const captionLeaf = definitionOf(caption);
        expect(captionLeaf === undefined || captionLeaf.kind === "composite" ? undefined : threadOf(captionLeaf.declaration, "System", captionLeaf.name)).toBe("main");
        expect(() => create({ components: { read: [unregistered] } })).toThrow(`uses component "typesSystemTest/unregistered", which isn't a registered component`);
        expect(() => create({ components: { read: [time] } })).toThrow(`uses component "typesSystemTest/time", which isn't a registered component`);
    });
    it("says why a key isn't registered: undeclared, or its module not built with the plugin", () => {
        const create = (declaration: unknown) => Reflect.apply(createResolved, undefined, [declaration, () => {}]);
        expect(() => create({ components: { read: [unregistered] } })).toThrow("declare it beside its key, in interface Components or Resources");
        // Made in a function, so the build gave it no id, as one made in a module the plugin didn't build has none.
        const unbuilt = Symbol("unbuilt");
        expect(() => create({ components: { read: [unbuilt] } })).toThrow("Compiler.plugin() registers keys from their declarations, and didn't build the module making it");
    });
});

describe("System.create of a composite", () => {
    it("records a composite whose members may live on different threads, from its list or its declaration", () => {
        const show = System.create({ components: { with: [node] } }, row => { row[node].hidden = true; });
        const name = System.create({ components: { with: [label] } }, row => { row[label] = ""; });
        const frame = System.create({ systems: [show, name] });
        expect(definitionOf(frame)?.kind).toBe("composite");
        expect(definitionOf(System.create({ systems: [show] }))).not.toBe(definitionOf(frame));
        const listed = System.create([show, name]);
        const listedDefinition = definitionOf(listed);
        expect(listedDefinition?.kind === "composite" ? listedDefinition.declaration.systems : undefined).toEqual([show, name]);
        expect(listed.name).toBe("listed");
    });
    it("tells a composite's declaration from a system's by its body", () => {
        const untyped: (...parameters: never[]) => unknown = System.create;
        expect(() => Reflect.apply(untyped, undefined, [{ name: "bodiless" }])).toThrow("A system needs a body, and a composite its systems.");
        const leaf = Reflect.apply(untyped, undefined, [giveAccess({ systems: [] }), () => {}]);
        expect(definitionOf(leaf)?.kind).toBe("system");
    });
    it("rejects members ordered in a cycle, and conflicting members with no order between them", () => {
        const first = System.create({ components: { with: [position] } }, row => { row[position] += 1; });
        const second = System.create({ components: { with: [position] }, after: [first] }, row => { void row[position]; });
        const third = System.create({ components: { with: [position] } }, row => { void row[position]; });
        expect(scheduleOf(requireDefinition(System.create({ systems: [second, first] }))).tiers.map(tier => tier.map(leaf => leaf.name))).toEqual([["first"], ["second"]]);
        expect(() => System.create({ systems: [first, third] })).toThrow('Systems "first" and "third" both access "typesSystemTest/position" and one writes it');
        const looped = System.create({ before: [first], after: [second] }, () => {});
        expect(() => System.create({ systems: [first, second, looped] })).toThrow("Ordering cycle");
    });
    it("runs observer members after its sync point, in no tier, never conflicting and ignoring constraints naming them", () => {
        const write = System.create({ components: { with: [position] } }, row => { row[position] += 1; });
        const watch = System.create({ observer: true, components: { with: [position] } }, row => { void row[position]; });
        const later = System.create({ components: { with: [position] }, after: [watch, write] }, row => { void row[position]; });
        const free = System.create({ after: [watch] }, ({ resources }) => { void resources[time]; });
        const schedule = scheduleOf(requireDefinition(System.create([write, watch, later, free])));
        expect(schedule.tiers.map(tier => tier.map(leaf => leaf.name))).toEqual([["write", "free"], ["later"]]);
        expect(schedule.observer.map(leaf => leaf.name)).toEqual(["watch"]);
        const alone = scheduleOf(requireDefinition(watch));
        expect([alone.tiers.length, alone.observer.map(leaf => leaf.name)]).toEqual([0, ["watch"]]);
    });
    it("rejects a member no constructor returned, and an input field two members declare differently", () => {
        expect(() => System.create({ systems: [{ name: "showMember" }] })).toThrow('member "showMember" isn\'t a system a System constructor returned');
        const move = System.create({}, (_context, input: { readonly distance: number }) => {});
        const tag = System.create({}, (_context, input: { readonly distance: string }) => {});
        const nested = System.create({ systems: [tag] });
        const untyped: (...parameters: never[]) => unknown = System.create;
        const composite = (declaration: object): unknown => Reflect.apply(untyped, undefined, [declaration]);
        expect(() => composite({ systems: [move, nested] })).toThrow('Systems "move" and "tag" declare input field "distance" with different schemas.');
    });
});

describe("System.render", () => {
    it("reads the components its accessors name, once each, and runs only while gpuDevice is set", () => {
        const draw = System.render({ shader: { accessors: { place: height, again: height } } }, () => {});
        const definition = definitionOf(draw);
        expect(definition?.kind === "render" ? [definition.declaration.components, definition.declaration.resources] : null).toEqual([{ read: [height] }, { is: [gpuDevice] }]);
        const render = (declaration: object, uses: Parameters<typeof giveAccess>[1] = {}): unknown => Reflect.apply(System.render, undefined, [giveAccess(declaration, uses), () => {}]);
        expect(() => render({ shader: { accessors: {} } }, { resources: { read: [document] } })).toThrow('uses "typesSystemTest/document" on "main" and "gpuDevice" on "world"');
    });
    it("rejects at creation accessors its shader can't read, and reductions", () => {
        const render = (declaration: object, uses: Parameters<typeof giveAccess>[1] = {}): unknown => Reflect.apply(System.render, undefined, [giveAccess(declaration, uses), () => {}]);
        expect(() => System.render({ shader: { accessors: { loop: height } } }, () => {})).toThrow(`can't render: "loop" isn't usable as a WGSL function name.`);
        expect(() => render({ shader: { accessors: {} } }, { resources: { reduce: [total] } })).toThrow("writes or reduces into resources; a render system only reads");
        expect(() => render({ shader: { accessors: {} }, observer: true })).toThrow("is an observer, so it records no GPU work");
    });
});
