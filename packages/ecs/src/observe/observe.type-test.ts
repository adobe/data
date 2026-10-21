import { Component, Resource, type Entity, type World } from '../interface/index.js';
import { Observe } from './index.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

declare const world: World;
declare const entity: Entity;

const point = Symbol("observeTypeTest/point");
const persistent = Symbol("observeTypeTest/persistent");
const shared = Symbol("observeTypeTest/shared");
const time = Symbol("observeTypeTest/time");
declare module '@adobe/ecs' {
    export interface Components {
        [point]: { type: { readonly x: number } };
        [persistent]: { type: true };
        [shared]: { type: true };
    }
    export interface Resources {
        [time]: { type: number };
    }
}
Component.register(point, { type: { type: "object", properties: { x: { type: "number" } } } });
Component.register(persistent, { type: { const: true } });
Component.register(shared, { type: { const: true } });
Resource.register(time, { type: { type: "number", default: 0 } });

// The module's `Observe` has the shape of the package root's.
check<Equal<Observe<number>, (notify: (value: number) => void) => () => void>>();

// A resource's value, read-only.
const observedTime: Observe<number> = Observe.resource(world, time);
// @ts-expect-error a resource's value has its type
Observe.resource(world, time)((value: string) => { void value; });
// @ts-expect-error only resources are observed by key
Observe.resource(world, point);

// An entity's listed components, required present and optional possibly, or null.
const observedBoth: Observe<({ readonly [point]: { readonly x: number } } & { readonly [shared]?: true }) | null> = Observe.entity(world, entity, { required: [point], optional: [shared] });
Observe.entity(world, entity, { required: [point] })(value => {
    if (value === null) return;
    check<Equal<typeof value[typeof point]["x"], number>>();
    // @ts-expect-error only listed components are observed
    void value[shared];
    // @ts-expect-error observed values are read-only
    value[point].x = 1;
});
Observe.entity(world, entity, { optional: [point] })(value => {
    // @ts-expect-error an optional component may be missing
    void value?.[point].x;
});
// @ts-expect-error the whole-entity form is gone: list the components
Observe.entity(world, entity);
// @ts-expect-error an observed entity may be dead
Observe.entity(world, entity, { required: [point] })((value: { readonly [point]: { readonly x: number } }) => { void value; });
// @ts-expect-error only components are observed on an entity
Observe.entity(world, entity, { optional: [time] });

// Queries: `where` and `order` name only required components; `count` takes no `order` or `page`.
const query: Observe.Query<[typeof persistent]> = { required: [persistent], not: [shared], where: { [persistent]: true }, order: { [persistent]: true } };
const selected: Observe<readonly Entity[]> = Observe.select(world, query);
const selectedAll: Observe<readonly Entity[]> = Observe.select(world, {});
const counted: Observe<number> = Observe.count(world, { required: [persistent], where: { [persistent]: { "!=": true } } });
const paged: Observe<readonly Entity[]> = Observe.select(world, { required: [persistent], order: { [persistent]: true }, page: { offset: 20, limit: 10 } });
Observe.select(world, { required: [point], where: { [point]: { x: 1 } } })(entities => {
    // @ts-expect-error selected entities are read-only
    entities.push(entity);
});
// @ts-expect-error where may only filter required components
Observe.select(world, { required: [persistent], where: { [shared]: true } });
// @ts-expect-error order may only sort by required components
Observe.select(world, { required: [persistent], order: { [shared]: true } });
// @ts-expect-error a where value has its component's type
Observe.select(world, { required: [point], where: { [point]: { x: "one" } } });
// @ts-expect-error count has no order
Observe.count(world, { required: [persistent], order: { [persistent]: true } });
// @ts-expect-error count has no page
Observe.count(world, { required: [persistent], page: { offset: 0, limit: 10 } });
// @ts-expect-error a page has an offset and a limit
Observe.select(world, { required: [persistent], page: { limit: 10 } });
// @ts-expect-error queries list only components
Observe.select(world, { required: [time] });

// The first value of any observer.
const first: Promise<number> = Observe.toPromise(Observe.count(world, {}));

void [observedTime, observedBoth, selected, selectedAll, counted, paged, first];
