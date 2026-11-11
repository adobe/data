// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System } from "./system.js";
import { Component } from "../component/component.js";
import { describe, expect, it } from "vitest";
import { giveAccess, identify } from "../registry/ids.test-helper.js";
import { syncSystemOf, programDerivations } from "../registry/index.js";
import { clock } from "../resources/index.js";

const node = Symbol("typesSyncSystemTest/node");
const label = Symbol("typesSyncSystemTest/label");
const slot = Symbol("typesSyncSystemTest/slot");
const total = Symbol("typesSyncSystemTest/total");
const time = Symbol("typesSyncSystemTest/time");
const mark = Symbol("typesSyncSystemTest/mark");
const other = Symbol("typesSyncSystemTest/other");
const page = Symbol("typesSyncSystemTest/page");
const tags = Symbol("typesSyncSystemTest/tags");

declare module "@adobe/ecs" {
    export interface Components {
        [node]: { type: HTMLElement; thread: "main" };
        [label]: { type: string };
        [slot]: { type: number; derived: true };
        [mark]: { type: true; derived: true };
        [other]: { type: true; derived: true };
        [tags]: { type: readonly string[] };
    }
    export interface Resources {
        [total]: { type: number; reduce: "+" };
        [time]: { type: number };
        [page]: { type: Document | null; thread: "main" };
    }
}


/** Declares as an untyped caller would, bypassing the types' checks, its body using what `uses` says, as the build would infer. */
const untyped = (constructor: (...parameters: never[]) => unknown, declaration: object, uses: Parameters<typeof giveAccess>[1] = {}): unknown =>
    Reflect.apply(constructor, undefined, [giveAccess(declaration, uses), () => {}]);

describe("System.removed and System.changes", () => {
    it("return the one declared already under an id when declared again, with its new body, and reject its id with another declaration", () => {
        const release = System.removed(identify({ components: { with: [node] } }, "f.ts#release"), () => {});
        const body = (): void => {};
        // A body the build doesn't see is given what it uses.
        expect(System.removed(giveAccess(identify({ components: { with: [node] } }, "f.ts#release")), body)).toBe(release);
        const found = syncSystemOf(release);
        expect(found?.kind === "removed" ? found.body : null).toBe(body);
        expect(() => System.removed(identify({ components: { with: [label] } }, "f.ts#release"), () => {})).toThrow("reload the page");
        expect(() => System.changes(identify({}, "f.ts#release"), () => {})).toThrow("its id is a removed system's");
    });
    it("reject a body writing its row, which holds the values from before", () => {
        expect(() => untyped(System.removed, { components: { with: [label] } }, { write: [label] })).toThrow("which is read-only");
    });
    it("keep systems of one label apart", () => {
        const twin = (): System<never> => System.changes({ watch: [label] }, () => {});
        const [first, second] = [twin(), twin()];
        expect(second).not.toBe(first);
        expect([first.name, second.name]).toEqual(["twin", "twin"]);
    });
    it("reject before and after naming what isn't a changes or removed system, for untyped callers", () => {
        const tick = System.create({}, () => {});
        const late = System.removed({ components: { with: [label] } }, () => {});
        System.removed({ components: { with: [label] }, before: [late] }, () => {});
        expect(() => untyped(System.removed, { components: { with: [label] }, after: [tick] }, { read: [label] }))
            .toThrow(`is ordered with "tick", which isn't a changes or removed system; those are ordered only with each other.`);
        expect(() => untyped(System.changes, { watch: [label], before: [tick] }))
            .toThrow(`is ordered with "tick", which isn't a changes or removed system`);
        expect(() => Reflect.apply(System.create, undefined, [giveAccess({ after: [late] }), () => {}]))
            .toThrow(`is ordered with "late", a changes or removed system; those run in sync points and are ordered only with each other.`);
        expect(() => Reflect.apply(System.create, undefined, [{ systems: [tick], during: [late] }]))
            .toThrow(`is ordered with "late", a changes or removed system`);
    });
    it("reject what types reject, for untyped callers", () => {
        expect(() => untyped(System.removed, { components: {} }, { resources: { write: [clock] } })).toThrow(`writes "clock", which only the world writes`);
        expect(() => untyped(System.removed, { components: {} }, { resources: { write: [total] } })).toThrow("which is reduced");
        expect(() => untyped(System.removed, { components: {} }, { resources: { reduce: [total] } })).toThrow("only systems contribute to a reduction");
        expect(() => untyped(System.removed, { components: { with: [node, tags] } }, { read: [node, tags] })).toThrow('uses "typesSyncSystemTest/node" on "main" and "typesSyncSystemTest/tags" on "world"');
        expect(() => untyped(System.changes, { name: "derived", watch: [slot] })).toThrow("which is derived");
        expect(() => untyped(System.changes, { name: "unregistered", watch: [Symbol("typesSyncSystemTest/unregistered")] })).toThrow("which isn't a registered component, resource or trait");
        expect(() => untyped(System.changes, { watch: { components: [time], resources: [] } })).toThrow(`watches "typesSyncSystemTest/time" among its components, which isn't a registered component or trait`);
        expect(() => untyped(System.changes, { watch: { components: true, resources: [label] } })).toThrow(`watches "typesSyncSystemTest/label" among its resources, which isn't a registered resource or trait`);
        expect(() => untyped(System.changes, { watch: { components: [slot], resources: [] } })).toThrow("which is derived");
        expect(() => untyped(System.removed, { components: { with: [time] } })).toThrow(`uses component "typesSyncSystemTest/time", which isn't a registered component`);
        expect(() => untyped(System.removed, { components: { with: [label] }, lookup: { others: { not: [Symbol("typesSyncSystemTest/unregistered")] } } }, { read: [label] })).toThrow("which isn't a registered component");
    });
    it("reject resource writes and lookups in a removed system on another thread than the world's, and a changes system watching or reading another thread's values", () => {
        expect(() => untyped(System.removed, { components: { with: [node] } }, { read: [node], resources: { write: [time] } }))
            .toThrow(`runs on thread "main" and writes resources; one on another thread than the world's runs after the sync point, so it writes none.`);
        expect(() => untyped(System.removed, { components: { with: [tags] } }, { read: [tags], resources: { write: [page] } }))
            .toThrow('uses "typesSyncSystemTest/tags" on "world" and "typesSyncSystemTest/page" on "main"');
        expect(() => untyped(System.removed, { components: { with: [node] }, lookup: { labels: { with: [mark] } } }, { read: [node], lookup: { labels: [mark] } }))
            .toThrow(`runs on thread "main" and looks up other entities; one on another thread than the world's runs after the sync point, so it looks up none.`);
        expect(() => untyped(System.changes, { name: "saveNodes", watch: [node] }))
            .toThrow(`watches or reads values on thread "main"; a changes system runs on the world's thread, in the sync point.`);
        expect(() => untyped(System.changes, { watch: [tags] }, { resources: { read: [page] } }))
            .toThrow('uses "typesSyncSystemTest/tags" on "world" and "typesSyncSystemTest/page" on "main"');
        expect(() => untyped(System.changes, {}, { resources: { read: [page] } }))
            .toThrow(`watches or reads values on thread "main"; a changes system runs on the world's thread, in the sync point.`);
        expect(() => untyped(System.changes, { name: "savePage", watch: [page] }))
            .toThrow(`watches or reads values on thread "main"; a changes system runs on the world's thread, in the sync point.`);
        // Reading another thread's values, without writing or looking up, it's created.
        const detach = System.removed({ components: { with: [node] } }, row => { void row[node]; });
        expect(syncSystemOf(detach)?.kind).toBe("removed");
    });
});

describe("Component.derive", () => {
    it("records a derivation, the one already recorded when declared again under its id, and rejects its id with another declaration", () => {
        Component.derive(slot, identify({ from: [label] }, "r.ts#derive(slot)"));
        expect(programDerivations().map(derivation => derivation.name)).toEqual(["derive(slot)"]);
        Component.derive(slot, identify({ from: [label] }, "r.ts#derive(slot)"));
        expect(programDerivations()).toHaveLength(1);
        expect(() => Component.derive(slot, identify({ from: [node] }, "r.ts#derive(slot)"))).toThrow("reload the page");
        Component.derive(slot, { from: [node] });
        expect(programDerivations().map(derivation => derivation.name)).toEqual(["derive(slot)", "derive(typesSyncSystemTest/slot)"]);
        expect(programDerivations().map(derivation => derivation.declaration)).toEqual([
            { components: { has: [label], not: undefined }, derive: [slot] },
            { components: { has: [node], not: undefined }, derive: [slot] },
        ]);
    });
    it("rejects derivations in a cycle through a negation", () => {
        Component.derive(other, { not: [mark] });
        expect(() => Component.derive(mark, { from: [other] })).toThrow("cycle through a negation");
        expect(programDerivations()).toHaveLength(3);
    });
    it("rejects deriving a component that isn't derived, or matching on a resource", () => {
        const derive = (derived: symbol, declaration: object): unknown => Reflect.apply(Component.derive, undefined, [derived, declaration]);
        expect(() => derive(label, {})).toThrow(`derives "typesSyncSystemTest/label", which isn't declared derived`);
        expect(() => derive(slot, { from: [time] })).toThrow("which isn't a registered component");
        expect(programDerivations()).toHaveLength(3);
    });
});

describe("labels", () => {
    it("are the bindings of their ids, or else their kinds numbered", () => {
        const release = System.removed(identify({ components: { with: [node] } }, "sync-systems.ts#release"), () => {});
        expect(release.name).toBe("release");
        // Made in an expression no binding names, so the build labels them by nothing.
        const [changes] = [System.changes({ watch: [label] }, () => {})];
        expect(changes.name.replace(/#\d+$/, "#n")).toBe("system #n");
    });
});
