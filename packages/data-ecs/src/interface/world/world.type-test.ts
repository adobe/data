import type { Entity } from '../entity/entity.js';
import type { Observe, Observers } from '../index.js';
import { System } from '../system/system.js';
import { main, move, position, time, total } from '../system/system.type-test.js';
import type { World } from './world.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

declare const world: World;
declare const entity: Entity;
declare const create: World.Create;

// What `observe` holds is named from the package root, so a consumer's declarations can name it.
check<Equal<World["observe"], Observers>>();

const point = Symbol("worldTypeTest/point");
const persistent = Symbol("worldTypeTest/persistent");
const shared = Symbol("worldTypeTest/shared");
declare module '@adobe/data-ecs' {
    export interface Components {
        [point]: { type: { x: number } };
        [persistent]: { type: true };
        [shared]: { type: true };
    }
}
// Observing a query: `where` and `order` name only required components; `count` takes no `order` or `page`.
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
// A page: a slice of the ordered result; count gives the total, so it takes none.
const paged: Observe<readonly Entity[]> = world.observe.select({ required: [persistent], order: { [persistent]: true }, page: { offset: 20, limit: 10 } });
// @ts-expect-error a page has an offset and a limit
world.observe.select({ required: [persistent], page: { limit: 10 } });
// @ts-expect-error count has no page
world.observe.count({ required: [persistent], page: { offset: 0, limit: 10 } });
// @ts-expect-error queries list only components
world.observe.select({ required: [time] });
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
world.observe.entity(entity, { optional: [time] });
void [observedWhole, observedBoth, stopEntity];

const ran: Promise<World.Report> = world.run(main);
const moved: Promise<World.Report> = world.run(move, { distance: 1 });
const reported = async () => {
    const { failures, skipped, dropped } = await world.run(main);
    for (const failure of failures) {
        check<Equal<typeof failure.kind, "system" | "finalizer" | "gpu" | "observer">>();
        const text: string = `${failure.name}: ${failure.message}`;
        const stack: string | null = failure.stack;
        void [text, stack];
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
const observed: AdobeObserve<number> = world.observe.resource(time);
const typed: Observe<number> = world.observe.resource(time);
const stop: () => void = typed(value => { const time: number = value; void time; });
// @ts-expect-error a resource's value has its type
world.observe.resource(time)((value: string) => { void value; });
// @ts-expect-error only resources are observed by name
world.observe.resource(position);
const created: World = create();
const withResources: World = create({ [time]: 1, [total]: 0 });
// @ts-expect-error a resource's initial value has its type
create({ [time]: "now" });
// @ts-expect-error resources takes only resource keys
create({ [position]: 0 });
// @ts-expect-error a key is its symbol, never its description
create({ "systemTest/time": 1 });
// @ts-expect-error systems register on their first run
void world.systems;
const disposed: Promise<void> = world.dispose();
const usingDispose = async () => {
    await using scoped = create();
    await scoped.run(main);
};
void [disposed, usingDispose, selected, paged, selectedAll, counted, query, ran, moved, reported, observed, stop, created, withResources];

// World.create is a type here, with no runtime value.
check<Equal<ReturnType<World.Create>, World>>();
