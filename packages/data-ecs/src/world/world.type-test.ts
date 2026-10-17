import type { Entity } from '../entity/entity.js';
import { persistent, shared } from '../components/index.js';
import { System } from '../system/system.js';
import { main, move } from '../system/system.type-test.js';
import { World } from './world.js';
import type { Observe } from '../index.js';

declare const world: World;
declare const entity: Entity;

const point = 'worldTypeTest/point';
declare module '@adobe/data-ecs' {
    export interface Components {
        [point]: { type: { x: number } };
    }
}
// Observing a query: `where` and `order` name only required components; `count` takes no `order`.
const query: World.Query<[typeof persistent]> = { required: [persistent], not: [shared], where: { [persistent]: true }, order: { [persistent]: true } };
const selected: Observe<readonly Entity[]> = world.observe.select(query);
const selectedAll: Observe<readonly Entity[]> = world.observe.select({});
const counted: Observe<number> = world.observe.count({ required: [persistent], where: { [persistent]: { "!=": true } } });
world.observe.select({ required: [point], where: { [point]: { x: 1 } } })(entities => {
    // @ts-expect-error selected entities are read-only
    entities.push(entity);
});
// @ts-expect-error where may only filter required components
world.observe.select({ required: [persistent], where: { [shared]: true } });
// @ts-expect-error order may only sort by required components
world.observe.select({ required: [persistent], order: { [shared]: true } });
// @ts-expect-error a where value has its component's type
world.observe.select({ required: [point], where: { [point]: { x: "one" } } });
// @ts-expect-error count has no order
world.observe.count({ required: [persistent], order: { [persistent]: true } });
// @ts-expect-error queries list only components
world.observe.select({ required: ["systemTest/time"] });
// @ts-expect-error synchronous reads are gone: observing is the way to read
void world.query;
// @ts-expect-error synchronous reads are gone: observing is the way to read
void world.read;
// @ts-expect-error GPU writes are read back for observers, without synchronize
void world.synchronize;

// Observing an entity: required components are present, optional ones possibly; without options, every one possibly.
const observedWhole: Observe<{ readonly [K in typeof point | typeof shared]?: unknown } | null> = world.observe.entity(entity);
const observedBoth: Observe<({ readonly [point]: { readonly x: number } } & { readonly [shared]?: true }) | null> = world.observe.entity(entity, { required: [point], optional: [shared] });
const stopEntity: () => void = world.observe.entity(entity, { required: [point] })(value => {
    const x: number | null = value === null ? null : value[point].x;
    void x;
});
world.observe.entity(entity, { optional: [point] })(value => {
    // @ts-expect-error an optional component may be absent
    void value?.[point].x;
});
world.observe.entity(entity, { required: [point], optional: [shared] })(value => {
    if (value === null) return;
    const x: number = value[point].x;
    const maybe: true | undefined = value[shared];
    // @ts-expect-error an optional component may be absent
    const surely: true = value[shared];
    // @ts-expect-error only listed components are observed
    void value[persistent];
    // @ts-expect-error observed values are read-only
    value[point].x = 1;
    void [x, maybe, surely];
});
world.observe.entity(entity)(value => {
    if (value === null) return;
    const x: number | undefined = value[point]?.x;
    // @ts-expect-error every component may be absent
    void value[point].x;
    // @ts-expect-error observed values are read-only
    value[shared] = true;
    void x;
});
// @ts-expect-error options are an object, not a list
world.observe.entity(entity, [point]);
// @ts-expect-error an observed entity may be dead
world.observe.entity(entity)((value: object) => { void value; });
// @ts-expect-error a component's value has its type
world.observe.entity(entity, { required: [point] })((value: { readonly [point]: string } | null) => { void value; });
// @ts-expect-error options list only components
world.observe.entity(entity, { optional: ["systemTest/time"] });
void [observedWhole, observedBoth, stopEntity];

const ran: Promise<World.Report> = world.run(main);
const moved: Promise<World.Report> = world.run(move, { distance: 1 });
const reported = async () => {
    const { failures, skipped, dropped } = await world.run(main);
    for (const failure of failures) {
        const kind: "system" | "finalizer" | "gpu" | "observer" = failure.kind;
        const text: string = `${failure.name}: ${failure.message}`;
        const stack: string | null = failure.stack;
        void [kind, text, stack];
    }
    const names: readonly string[] = skipped;
    const count: number = dropped;
    // @ts-expect-error a report is read-only
    failures.push({ kind: "system", name: "", message: "", stack: null });
    void [names, count];
};
// @ts-expect-error a system with input needs it
world.run(move);
// @ts-expect-error input must match its schema
world.run(move, { distance: "far" });
// @ts-expect-error a system without input takes none
world.run(main, {});

// The same shape as @adobe/data's Observe, without depending on it.
type AdobeObserve<T> = (notify: (value: T) => void) => () => void;
const observed: AdobeObserve<number> = world.observe.resource("systemTest/time");
const typed: Observe<number> = world.observe.resource("systemTest/time");
const stop: () => void = typed(value => { const time: number = value; void time; });
// @ts-expect-error a resource's value has its type
world.observe.resource("systemTest/time")((value: string) => { void value; });
// @ts-expect-error only resources are observed by name
world.observe.resource("systemTest/position");
const created: World = World.create();
const withResources: World = World.create({ "systemTest/time": 1, "systemTest/total": 0 });
// @ts-expect-error a resource's initial value has its type
World.create({ "systemTest/time": "now" });
// @ts-expect-error resources takes only resource names
World.create({ "systemTest/position": 0 });
// @ts-expect-error systems register on their first run
void world.systems;
const disposed: Promise<void> = world.dispose();
const usingDispose = async () => {
    await using scoped = World.create();
    await scoped.run(main);
};
void [disposed, usingDispose, selected, selectedAll, counted, query, ran, moved, reported, observed, stop, created, withResources];
