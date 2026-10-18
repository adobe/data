import { Resource } from '../resource/resource.js';
import { Component } from '../component/component.js';
import { Archetype } from '../archetype/archetype.js';
import type { Entity } from '../entity/entity.js';
import type { Commands } from './commands.js';
import { threadClaims, threadStatus } from '../components/index.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const position = Symbol("commandsTypeTest/position");
const velocity = Symbol("commandsTypeTest/velocity");
const label = Symbol("commandsTypeTest/label");
const player = Symbol("commandsTypeTest/player");
const slot = Symbol("commandsTypeTest/slot");
const time = Symbol("commandsTypeTest/time");
declare module '@adobe/data-ecs' {
    export interface Components {
        [position]: typeof positionTraits;
        [velocity]: typeof velocityTraits;
        [label]: typeof labelTraits;
        [player]: typeof playerTraits;
        [slot]: typeof slotTraits;
    }
    export interface Resources {
        [time]: typeof timeTraits;
    }
}
const positionTraits = Component.register(position, { type: { type: "number" } });
const velocityTraits = Component.register(velocity, { type: { type: "number" } });
const labelTraits = Component.register(label, { type: { anyOf: [{ type: "string" }, { type: "null" }] } });
const playerTraits = Component.register(player, { type: { const: true } });
const slotTraits = Component.register(slot, { type: { type: "number", default: 0 }, derived: true });
const timeTraits = Resource.register(time, { type: { type: "number", default: 0 } });

const particle = Archetype.create([position, velocity, label, player]);

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
    // @ts-expect-error commands never add a component only the world writes
    commands.add(entity, threadStatus, "gone");
    // @ts-expect-error nor spawn one
    commands.spawn([threadClaims]);
    // @ts-expect-error nor remove one
    commands.remove(entity, threadStatus);
    commands.despawn(entity);
};
