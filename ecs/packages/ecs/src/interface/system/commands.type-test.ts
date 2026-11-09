// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Resource } from '../resource/resource.js';
import { Component } from '../component/component.js';
import type { Entity } from '../entity/entity.js';
import type { Commands } from './commands.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const position = Symbol("commandsTypeTest/position");
const velocity = Symbol("commandsTypeTest/velocity");
const label = Symbol("commandsTypeTest/label");
const player = Symbol("commandsTypeTest/player");
const slot = Symbol("commandsTypeTest/slot");
const time = Symbol("commandsTypeTest/time");
const chunk = Symbol("commandsTypeTest/chunk");
const health = Symbol("commandsTypeTest/health");
const cell = Symbol("commandsTypeTest/cell");
declare module '@adobe/ecs' {
    export interface Components {
        [position]: { type: number };
        [velocity]: { type: number };
        [label]: { type: string | null };
        [player]: { type: true };
        [slot]: { type: number; derived: true };
        [chunk]: { type: number; shared: true };
        [health]: { type: { readonly hp: number; readonly alive: boolean; readonly cell: readonly [number, number] } };
        [cell]: { type: readonly [number, number]; shared: true };
    }
    export interface Resources {
        [time]: { type: number };
    }
}

const particle = [position, velocity, label, player] as const;

export const issue = (commands: Commands, entity: Entity): void => {
    // `spawn` is curried: the components first, then their values, giving an entity.
    const insert = commands.spawn(particle);
    const spawned: Entity = insert({ [position]: 0, [velocity]: 1 });
    check<Equal<Parameters<typeof insert>[0], { readonly [position]: number; readonly [velocity]: number } & { readonly [label]?: string | null; readonly [player]?: true }>>();
    // A tag needs no value, nor does a component whose type allows null; any other is required.
    insert({ [position]: 0, [velocity]: 1, [label]: "a", [player]: true });
    // @ts-expect-error velocity has no default
    insert({ [position]: 0 });
    // @ts-expect-error values are exact against the components: velocity isn't in this spawn
    commands.spawn([position])({ [position]: 0, [velocity]: 1 });
    // @ts-expect-error values have the components' types
    commands.spawn([position])({ [position]: "zero" });
    // A plain or inline list spawns too.
    commands.spawn([position, player])({ [position]: 0 });
    commands.spawn([])({});
    // A list that isn't a tuple takes any of its components' values.
    const dynamic: (typeof position | typeof player)[] = [position];
    commands.spawn(dynamic)({});
    commands.spawn(dynamic)({ [position]: 1 });
    // @ts-expect-error but only theirs
    commands.spawn(dynamic)({ [velocity]: 1 });
    // @ts-expect-error spawn takes its components first
    commands.spawn({ [position]: 0 });
    // @ts-expect-error commands never add a derived component
    commands.spawn([slot]);
    // @ts-expect-error nor a resource
    commands.spawn([time]);
    void spawned;

    // `add` takes one component and its value, or a list and its values; a tag needs no value.
    commands.add(entity, position, 1);
    commands.add(entity, player);
    commands.add(entity, player, true);
    // @ts-expect-error a component with a value type takes its value
    commands.add(entity, position);
    // @ts-expect-error of its type
    commands.add(entity, position, "one");
    commands.add(entity, [position, player], { [position]: 1 });
    commands.add(entity, particle, { [position]: 1, [velocity]: 2 });
    // @ts-expect-error a list's values are exact against it
    commands.add(entity, [position], { [position]: 1, [velocity]: 2 });
    // @ts-expect-error the list form requires its components
    commands.add(entity, { [position]: 1 });
    // @ts-expect-error commands never add a derived component
    commands.add(entity, slot, 1);

    // `remove` takes one component or one list.
    commands.remove(entity, position);
    commands.remove(entity, [position, player]);
    commands.remove(entity, particle);
    // @ts-expect-error no rest parameters
    commands.remove(entity, position, velocity);
    // @ts-expect-error commands never remove a derived component
    commands.remove(entity, slot);
    commands.despawn(entity);

    // `despawnWhere` takes a query of at least one component, derived ones included.
    commands.despawnWhere({ with: [player] });
    commands.despawnWhere({ with: [position, slot], not: [player] });
    commands.despawnWhere({ with: particle });
    // @ts-expect-error `with` names at least one component
    commands.despawnWhere({ with: [] });
    // @ts-expect-error a query names components, not resources
    commands.despawnWhere({ with: [time] });
    // @ts-expect-error in `not` too
    commands.despawnWhere({ with: [player], not: [time] });
    // @ts-expect-error it takes a query, not an entity
    commands.despawnWhere(entity);
    // Its `where` gives what components' values match: a value, bounds on a number, or matches of a struct's or
    // tuple's members, the others left free. A shared component's is tested once per archetype.
    commands.despawnWhere({ with: [position], where: { [chunk]: 3 } });
    commands.despawnWhere({ with: [position], where: { [position]: 3 } });
    commands.despawnWhere({ with: [position], where: { [position]: { "<": 0 } } });
    commands.despawnWhere({ with: [health], where: { [health]: { hp: { "<=": 0 } } } });
    commands.despawnWhere({ with: [health], where: { [health]: { alive: false, cell: { 0: { ">=": 8, "<": 16 } } } } });
    commands.despawnWhere({ with: [health], where: { [health]: { hp: 0, alive: true, cell: [1, 2] } } });
    commands.despawnWhere({ with: [position], where: { [cell]: { 1: { "!==": 0 } } } });
    commands.despawnWhere({ with: [position], where: { [label]: "gone" } });
    const unloaded = { [chunk]: 4 } as const;
    commands.despawnWhere({ with: [position], where: unloaded });
    const doomed = { [health]: { hp: { "<=": 0 } } } as const;
    commands.despawnWhere({ with: [health], where: doomed });
    // @ts-expect-error a value of the component's type
    commands.despawnWhere({ with: [position], where: { [chunk]: "3" } });
    // @ts-expect-error bounds only on numbers
    commands.despawnWhere({ with: [health], where: { [health]: { alive: { "<": 1 } } } });
    // @ts-expect-error a bound is a number
    commands.despawnWhere({ with: [position], where: { [position]: { "<": "0" } } });
    // @ts-expect-error only the struct's members
    commands.despawnWhere({ with: [health], where: { [health]: { mana: 0 } } });
    // @ts-expect-error where takes values and bounds, not predicates
    commands.despawnWhere({ with: [position], where: { [chunk]: (value: number) => value > 3 } });
    // @ts-expect-error nor resources
    commands.despawnWhere({ with: [position], where: { [time]: 3 } });
};
