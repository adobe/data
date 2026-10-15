import type { Entity } from '../entity/entity.js';
import { persistent, shared } from '../components/index.js';
import { System } from '../system/system.js';
import { main, move } from '../system/system.type-test.js';
import type { Options } from './query/options.js';
import { World } from './world.js';

declare const world: World;
declare const entity: Entity;

const options: Options<[typeof persistent]> = { not: [shared], where: { [persistent]: true }, order: { [persistent]: true } };
const selected: readonly Entity[] = world.query.select([persistent], options);
const counted: number = world.query.count([persistent]);
const values: { readonly persistent: true } | null = world.read.entity(entity, [persistent, shared]);
const value: true | null = world.read.component(entity, shared);
// @ts-expect-error where may only filter components in has
world.query.select([persistent], { where: { [shared]: true } });
// @ts-expect-error read values are readonly
if (values) values[persistent] = true;

const ran: Promise<void> = world.run(main);
const moved: Promise<void> = world.run(move, { distance: 1 });
// @ts-expect-error a system with input needs it
world.run(move);
// @ts-expect-error input must match its schema
world.run(move, { distance: "far" });
// @ts-expect-error a system without input takes none
world.run(main, {});

const created: World = World.create();
const withResources: World = World.create({ resources: { "systemTest/time": 1, "systemTest/total": 0 } });
// @ts-expect-error a resource's initial value has its type
World.create({ resources: { "systemTest/time": "now" } });
// @ts-expect-error resources takes only resource names
World.create({ resources: { "systemTest/position": 0 } });
// @ts-expect-error systems register on their first run
void world.systems;
const found: System<System.Name, unknown> | null = System.get("test/move");
// @ts-expect-error get takes a declared system name
System.get("test/unregistered");
const disposed: Promise<void> = world.dispose();
const usingDispose = async () => {
    await using scoped = World.create();
    await scoped.run(main);
};
void [disposed, usingDispose, selected, counted, value, ran, moved, created, withResources, found];
