import type { Entity } from '../entity/entity.js';
import { persistent, shared } from '../components/index.js';
import type { System } from '../system/system.js';
import { main, move } from '../system/system.type-test.js';
import { World } from './world.js';

declare const world: World;
declare const entity: Entity;

const options: World.Query.Options<[typeof persistent]> = { not: [shared], where: { [persistent]: true }, order: { [persistent]: true } };
const selected: readonly Entity[] = world.query.select([persistent], options);
const counted: number = world.query.count([persistent]);
const values: { readonly persistent: true } | null = world.read.entity(entity, [persistent, shared]);
const value: true | null = world.read.component(entity, shared);
// @ts-expect-error where may only filter included components
world.query.select([persistent], { where: { [shared]: true } });
// @ts-expect-error read values are readonly
if (values) values[persistent] = true;

const ran: Promise<void> = world.run(main);
const moved: Promise<void> = world.run(move, { distance: 1 });
// @ts-expect-error a system with arguments needs them
world.run(move);
// @ts-expect-error arguments must match the schema
world.run(move, { distance: "far" });
// @ts-expect-error a system without arguments takes none
world.run(main, {});

const created: World = World.create();
const createdWithSystems: Promise<World> = World.create({ systems: [main, move] });
// @ts-expect-error creating with systems is async
World.create({ systems: [main] }).run(main);
const registered: Promise<World> = world.systems.register(main, move);
const found: System | null = world.systems.get("test/move");
// @ts-expect-error get takes a registered system name
world.systems.get("test/unregistered");
const disposed: Promise<void> = world.dispose();
const usingDispose = async () => {
    await using scoped = World.create();
    await scoped.run(main);
};
void [disposed, usingDispose, selected, counted, value, ran, moved, created, createdWithSystems, registered, found];
