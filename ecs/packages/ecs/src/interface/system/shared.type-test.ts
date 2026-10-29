// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component } from '../component/component.js';
import { Entity } from '../entity/entity.js';
import type { Vec2 } from '../math/index.js';
import type { Traits } from '../trait/types.js';
import { System } from './system.js';
import { Index } from '../indexes/index-type.js';
import type { Commands } from './commands.js';
import type { InvalidDeclarations } from '../world/declarations.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };
/** Whether two types take the same values, however they're written. */
type Same<X, Y> = [X] extends [Y] ? [Y] extends [X] ? true : false : false;

const team = Symbol("sharedTypeTest/team");
const cell = Symbol("sharedTypeTest/cell");
const level = Symbol("sharedTypeTest/level");
const health = Symbol("sharedTypeTest/health");
const position = Symbol("sharedTypeTest/position");
const camera = Symbol("sharedTypeTest/camera");
const owner = Symbol("sharedTypeTest/owner");
const tags = Symbol("sharedTypeTest/tags");
const style = Symbol("sharedTypeTest/style");
const scores = Symbol("sharedTypeTest/scores");
const tool = Symbol("sharedTypeTest/tool");
const maybe = Symbol("sharedTypeTest/maybe");

declare module '@adobe/ecs' {
    export interface Components {
        // A shared component's value is its archetype's, once for every entity holding it: comparable data.
        [team]: { type: "red" | "blue"; shared: true };
        [cell]: { type: Vec2.I32; shared: true };
        [level]: { type: number; shared: true };
        [tags]: { type: readonly string[]; shared: true };
        [style]: { type: { readonly color: string; readonly weight: number }; shared: true };
        [health]: { type: number };
        [position]: { type: Vec2 };
        [owner]: { type: Entity; reference: "owner" };
        [scores]: { type: ReadonlyMap<string, number> };
        [tool]: { type: { readonly name: string; readonly use: () => void } };
        [maybe]: { type: number | null };
    }
    export interface Resources {
        [camera]: { type: { readonly x: number; readonly y: number; readonly radius: number } };
    }
}

// Shared components are those declaring the trait.
type Ours = typeof team | typeof cell | typeof level | typeof tags | typeof style | typeof health | typeof position | typeof owner | typeof scores | typeof tool | typeof maybe;
check<Equal<Extract<Component.With<"shared">, Ours>, typeof team | typeof cell | typeof level | typeof tags | typeof style>>();

// The trait takes comparable data only: numbers, booleans, strings, arrays and plain objects of those.
check<Equal<Traits<typeof team>["shared"], true>>();
check<Equal<Traits<typeof style>["shared"], true>>();
check<Equal<Traits<typeof tags>["shared"], true>>();
check<Equal<Traits<typeof health>["shared"], true>>();
// Maps, objects with methods and null aren't.
check<Equal<Traits<typeof scores>["shared"], never>>();
check<Equal<Traits<typeof tool>["shared"], never>>();
check<Equal<Traits<typeof maybe>["shared"], never>>();
// A reference isn't shared: its target despawning acts on each holder.
check<Equal<Traits<typeof owner>["shared"], never>>();
// A shared value lives in shared memory, so it has no thread.
check<Equal<Traits<typeof team>["thread"], never>>();
check<Equal<Traits<typeof tags>["thread"], never>>();
// Rules derive only what has no value of its own to choose an archetype by.
check<Equal<Traits<typeof team>["derived"], never>>();
check<Equal<Traits<typeof camera>["shared"], never>>();
// Every declaration above holds.
check<Equal<Extract<InvalidDeclarations, { readonly key: Ours }>, never>>();

// A spawner of shared components takes their values first, constant for the spawner, then the rest of each entity's.
export const spawn = (commands: Commands): Entity => {
    const recruit = commands.spawn([team, health, position], { [team]: "red" });
    check<Same<Parameters<typeof recruit>[0], { readonly [health]: number; readonly [position]: Vec2 }>>();
    recruit({ [health]: 10, [position]: [0, 0] });
    // Non-shared components may be given first too, constant for every entity it spawns.
    const veteran = commands.spawn([team, health, position], { [team]: "blue", [health]: 100 });
    veteran({ [position]: [1, 1] });
    check<Same<Parameters<typeof veteran>[0], { readonly [position]: Vec2 }>>();
    // @ts-expect-error a component comes from one of the calls, never both
    veteran({ [position]: [1, 1], [health]: 3 });
    // Constants giving every component: the call gives nothing, or an empty object, and never one of them again.
    const whole = commands.spawn([team, health], { [team]: "red", [health]: 1 });
    whole();
    whole({});
    // @ts-expect-error a component its constants gave
    whole({ [health]: 2 });
    // @ts-expect-error a component outside its list
    whole({ [position]: [0, 0] });
    // @ts-expect-error every shared component is given first, since its value chooses the archetype
    commands.spawn([team, health]);
    // @ts-expect-error and given a value of its type
    commands.spawn([team, health], { [team]: "green" });
    // @ts-expect-error each shared component, not only some
    commands.spawn([team, cell], { [team]: "red" });
    // @ts-expect-error a constant names only components of the spawn
    commands.spawn([team], { [team]: "red", [health]: 1 });
    // A spawner without shared components takes no constants, or any of its components'.
    commands.spawn([health, position])({ [health]: 1, [position]: [0, 0] });
    const placed = commands.spawn([health, position], { [position]: [2, 2] });
    check<Same<Parameters<typeof placed>[0], { readonly [health]: number }>>();
    return placed({ [health]: 1 });
};

// A row reads a shared component as its archetype's value, and never assigns it: commands.add moves the entity.
export const read = System.create({ components: { with: [team, health] } }, (row, { commands }) => {
    const value: "red" | "blue" = row[team];
    // Its plain value type, read-only.
    check<Equal<typeof row[typeof team], "red" | "blue">>();
    row[health] = value === "red" ? 1 : 2;
    // @ts-expect-error a shared component's value is its archetype's, read-only: change it with commands.add
    row[team] = "blue";
    commands.add(row.entity, team, "blue");
    commands.remove(row.entity, team);
});
System.create({ components: { with: [cell, position] } }, row => {
    const [x, y] = row[cell];
    row[position] = [x, y];
});
System.create({ components: { with: [health], optional: [team] } }, row => {
    const value: "red" | "blue" | undefined = row[team];
    check<Equal<typeof row[typeof team], "red" | "blue" | undefined>>();
    void value;
    // @ts-expect-error nor an optional one
    row[team] = "red";
});
System.create({ readonly: true, components: { with: [team] } }, row => {
    check<Equal<typeof row[typeof team], "red" | "blue">>();
});

// where keeps a system to the archetypes whose shared values pass: by value, or by a predicate of the value and the
// world's resources.
export const visible = System.create({
    components: {
        with: [position],
        where: {
            [cell]: ([x, y], { resources }) => Math.abs(x - resources[camera].x) + Math.abs(y - resources[camera].y) <= resources[camera].radius,
            [team]: "red",
        },
    },
}, row => {
    void row[position];
});
System.create({ components: { with: [health], where: { [level]: value => value > 1 } } }, () => {});
System.create({
    components: {
        with: [health],
        // @ts-expect-error where names only shared components
        where: { [health]: 1 },
    },
}, () => {});
System.create({
    components: {
        with: [health],
        // @ts-expect-error a value is of the component's type
        where: { [team]: "green" },
    },
}, () => {});
System.create({
    components: {
        with: [health],
        // @ts-expect-error a predicate returns whether the value passes
        where: { [level]: value => value },
    },
}, () => {});
System.create({
    components: {
        with: [health],
        // @ts-expect-error a predicate reads resources only
        where: { [level]: (value, { commands }) => value > 0 && commands !== undefined },
    },
}, () => {});

// A shared component has no column: no index keys by it, and no render system's accessor reads it.
Index.create({ key: [health], components: { with: [team] } });
// @ts-expect-error a key part is a value each entity holds; filter by a shared component with where
Index.create({ key: [level] });
System.render({
    shader: {
        accessors: {
            // @ts-expect-error a render accessor reads a column
            tint: level,
        },
    },
}, () => {});

// where keeps rows unordered across archetypes.
System.create({
    components: {
        with: [health],
        // @ts-expect-error not with up, order or a target
        where: { [team]: "red" },
    },
    up: { through: owner },
}, () => {});
System.create({
    components: {
        with: [health],
        // @ts-expect-error not with up, order or a target
        where: { [team]: "red" },
    },
    target: "entity",
}, (_row, _context, _input: { readonly entity: Entity }) => {});
