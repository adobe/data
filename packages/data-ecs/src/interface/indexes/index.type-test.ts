import { Component } from '../component/component.js';
import { Entity } from '../entity/entity.js';
import { Finalizer } from '../finalizer/finalizer.js';
import { Vec3 } from '../math/index.js';
import { System } from '../system/system.js';
import { Index } from './index-type.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const cell = Symbol("indexTest/cell");
const position = Symbol("indexTest/position");
const velocity = Symbol("indexTest/velocity");
const serverId = Symbol("indexTest/serverId");
const health = Symbol("indexTest/health");
const track = Symbol("indexTest/track");
const start = Symbol("indexTest/start");
const clip = Symbol("indexTest/clip");
const playhead = Symbol("indexTest/playhead");
const owner = Symbol("indexTest/owner");
const archived = Symbol("indexTest/archived");
const label = Symbol("indexTest/label");

declare module '@adobe/data-ecs' {
    export interface Components {
        [cell]: { type: Vec3.I32 };
        [position]: { type: Vec3 };
        [velocity]: { type: Vec3 };
        [serverId]: { type: number };
        [health]: { type: number };
        [track]: { type: Entity };
        [start]: { type: number };
        [clip]: { type: number };
        [playhead]: { type: number };
        [owner]: { type: Entity; reference: "owner" };
        [archived]: { type: true };
        [label]: { type: string };
    }
}
Component.register(cell, { type: Vec3.I32.schema });
Component.register(position, { type: Vec3.schema });
Component.register(velocity, { type: Vec3.schema });
Component.register(serverId, { type: { type: "number" } });
Component.register(health, { type: { type: "number" } });
Component.register(track, { type: Entity.schema });
Component.register(start, { type: { type: "number" } });
Component.register(clip, { type: { type: "number" } });
Component.register(playhead, { type: { type: "number" } });
Component.register(owner, { type: Entity.schema, reference: "owner" });
Component.register(archived, { type: { const: true } });
Component.register(label, { type: { type: "string" } });

// An index is typed by its declaration, as written.
const grid = Index.create({ name: "indexTest/grid", key: [cell], components: { has: [position] } });
check<Equal<typeof grid, Index<{ readonly name: "indexTest/grid"; readonly key: readonly [typeof cell]; readonly components: { readonly has: readonly [typeof position] } }>>>();
const byServerId = Index.create({ key: [serverId], unique: true, components: { has: [health] } });
const clips = Index.create({ key: [track, start], sorted: true, components: { has: [clip] } });
const tasksOf = Index.create({ key: [owner], components: { not: [archived] } });
const named = Index.create({ key: [label, serverId], sorted: true, unique: true });
// With an empty key, an index holds the entities with every `has` component and no `not` one; with neither, every entity.
const living = Index.create({ key: [], components: { has: [health], not: [archived] } });
check<Equal<typeof living, Index<{ readonly key: readonly []; readonly components: { readonly has: readonly [typeof health]; readonly not: readonly [typeof archived] } }>>>();
const everything = Index.create({ key: [] });
const inOrder = Index.create({ key: [], sorted: true, components: { has: [start] } });
// @ts-expect-error a key is a list of components
Index.create({ key: [health, 3] });
// @ts-expect-error an index without a key holds no key once
Index.create({ key: [], unique: true });
// @ts-expect-error `not` excludes `has`
Index.create({ key: [], components: { has: [archived], not: [archived] } });
// @ts-expect-error `not` excludes neither key parts nor `has`
Index.create({ key: [owner], components: { has: [archived], not: [owner] } });

// Code accepting any sorted index takes `Index<{ readonly sorted: true }>`.
const sortedOnly = (index: Index<{ readonly sorted: true }>): string => index.name;
sortedOnly(clips);
sortedOnly(named);
// @ts-expect-error a hash index isn't sorted
sortedOnly(grid);
const anyIndex: Index = tasksOf;
// @ts-expect-error an index whose declaration isn't known isn't known to be sorted
sortedOnly(anyIndex);

// A hash lookup takes the whole key and gives the bucket's rows, with `length`, `changed` and `at`.
export const separate = System.create({
    components: { read: [position, cell], write: [velocity] },
    lookup: { near: { index: grid, read: [position] } },
}, (row, { lookup }) => {
    const near = lookup.near(row[cell]);
    check<Equal<typeof near.length, number>>();
    check<Equal<typeof near.changed, boolean>>();
    const other = near.at(0);
    const value: Vec3 = other[position];
    const entity: Entity = other.entity;
    row[velocity] = value;
    void entity;
    // @ts-expect-error rows are read-only
    other[position] = [0, 0, 0];
    // @ts-expect-error rows hold only the lookup's read
    void other[cell];
    // @ts-expect-error a hash lookup takes the whole key
    lookup.near();
    // @ts-expect-error a key part's value has its type
    lookup.near([0, 0]);
});

// A unique lookup gives the row or null.
export const applyDelta = System.create({
    input: { type: "object", properties: { id: { type: "number" }, hp: { type: "number" } } },
    lookup: { known: { index: byServerId, read: [health] } },
}, ({ input, lookup, commands }) => {
    const known = lookup.known(input.id);
    check<Equal<typeof known, ({ readonly entity: Entity } & { readonly [health]: number }) | null>>();
    if (known === null) commands.spawn([serverId, health])({ [serverId]: input.id, [health]: input.hp });
    else commands.add(known.entity, health, known[health] + input.hp);
});

// A sorted lookup takes a prefix of the key, whose last part may be a comparison.
export const cue = System.create({
    components: { read: [track, playhead] },
    lookup: { due: { index: clips, read: [clip, start], changed: [clip] } },
}, (row, { lookup }) => {
    const t = row[playhead];
    const due = lookup.due(row[track], { ">=": t, "<": t + 1 });
    for (let i = 0; i < due.length; i++) void [due.at(i)[clip], due.at(i)[start]];
    void lookup.due();
    void lookup.due({ ">": row[track] });
    void lookup.due(row[track], t);
    // @ts-expect-error only the last part given may be a comparison
    lookup.due({ "==": row[track] }, t);
});

// A unique sorted lookup gives a row by a whole key of plain values, and rows by anything else.
System.create({ lookup: { names: { index: named, read: [label] } } }, ({ lookup }) => {
    const one = lookup.names("a", 1);
    check<Equal<typeof one, ({ readonly entity: Entity } & { readonly [label]: string }) | null>>();
    const some = lookup.names("a", { ">": 1 });
    check<Equal<typeof some.length, number>>();
    const all = lookup.names();
    void all.at(0)[label];
});

// A lookup through an index without a key takes none and gives every row it holds, in entity order.
export const census = System.create({
    lookup: { living: { index: living, read: [health], changed: [health] }, all: { index: everything }, ordered: { index: inOrder, read: [start] } },
}, ({ lookup }) => {
    const rows = lookup.living();
    check<Equal<typeof rows.length, number>>();
    check<Equal<typeof rows.changed, boolean>>();
    check<Equal<ReturnType<typeof rows.at>, { readonly entity: Entity } & { readonly [health]: number }>>();
    void lookup.all().at(0).entity;
    void lookup.ordered().at(0)[start];
    // @ts-expect-error a lookup without a key takes none
    lookup.living(1);
    // @ts-expect-error rows hold only what every entity the index holds has
    void lookup.all().at(0)[health];
});
System.create({
    kernel: "cpu",
    components: { write: [velocity] },
    lookup: { living: { index: living, read: [health] } },
}, () => {});
System.create({
    components: { write: [health] },
    // @ts-expect-error a system doesn't write what it reads through an index
    lookup: { living: { index: living, read: [health] } },
}, () => {});
System.create({ components: { read: [start], write: [playhead] }, order: inOrder }, row => {
    row[playhead] = row[start];
});

// Finalizers look up through indexes too.
Finalizer.create({ components: { read: [owner] }, lookup: { tasks: { index: tasksOf } } }, (row, { lookup }) => {
    const tasks = lookup.tasks(row[owner]);
    void tasks.at(0).entity;
});

System.create({
    components: { read: [cell] },
    // @ts-expect-error an index lookup reads only what every entity the index holds has
    lookup: { near: { index: grid, read: [velocity] } },
}, () => {});

System.create({
    components: { read: [cell] },
    // @ts-expect-error an index lookup watches only what every entity the index holds has
    lookup: { near: { index: grid, changed: [velocity] } },
}, () => {});

System.create({
    components: { write: [cell] },
    // @ts-expect-error a system doesn't write what it finds rows by
    lookup: { near: { index: grid } },
}, () => {});

System.create({
    components: { write: [position] },
    // @ts-expect-error a system doesn't write what it reads through an index
    lookup: { near: { index: grid, read: [position] } },
}, () => {});

System.create({
    kernel: "cpu",
    components: { read: [cell], write: [velocity] },
    lookup: { near: { index: grid, read: [position] } },
}, () => {});

System.create({
    kernel: "cpu",
    components: { read: [cell], write: [velocity] },
    lookup: { near: { index: grid, changed: [position] } },
}, () => {});

System.create({
    kernel: "cpu",
    components: { write: [velocity] },
    // @ts-expect-error kernels look up only through indexes of struct keys
    lookup: { names: { index: named } },
}, () => {});

System.create({
    kernel: "gpu",
    components: { write: [velocity] },
    // @ts-expect-error GPU kernels can't use lookups
    lookup: { near: { index: grid } },
}, () => {});

// `order` runs a system's rows in a sorted index's order.
System.create({ components: { read: [start], write: [playhead] }, order: clips }, row => {
    row[playhead] = row[start];
});
System.create({ kernel: "cpu", components: { read: [start], write: [playhead] }, order: clips }, row => {
    row[playhead] = row[start];
});
// A sorted index typed by its declaration is one of `Index<{ readonly sorted: true }>`.
const ordering: Index<{ readonly sorted: true }> = clips;
void ordering;
// @ts-expect-error a hash index has no order
System.create({ components: { write: [velocity] }, order: grid }, () => {});
// @ts-expect-error a hash index isn't one of `Index<{ readonly sorted: true }>`
const unordered: Index<{ readonly sorted: true }> = grid;
void unordered;
// @ts-expect-error a system without components runs once, in no order
System.create({ order: clips }, () => {});
System.create({
    components: { read: [clip], write: [playhead] },
    up: { through: owner },
    // @ts-expect-error `up` orders rows too
    order: clips,
}, () => {});
System.create({
    components: { write: [start] },
    // @ts-expect-error a system doesn't write what its rows are ordered by
    order: clips,
}, () => {});
System.create({
    kernel: "gpu",
    components: { write: [velocity] },
    // @ts-expect-error GPU kernels have no order yet
    order: clips,
}, () => {});
System.create({
    kernel: "cpu",
    components: { write: [velocity] },
    // @ts-expect-error kernels are ordered only by indexes of struct keys
    order: named,
}, () => {});

// An index lookup's `changed: true` runs its system only when the index's entries changed since it last ran: its
// lists' `changed` then reports entries alone. Observer systems and CPU kernels take it; it's not a list of components.
System.create({ observer: true, lookup: { living: { index: living, changed: true } } }, ({ lookup }) => {
    const rows = lookup.living();
    check<Equal<typeof rows.changed, boolean>>();
    check<Equal<typeof rows.length, number>>();
});
System.create({ components: { read: [cell] }, lookup: { near: { index: grid, read: [position], changed: true } } }, (row, { lookup }) => {
    void lookup.near(row[cell]).at(0)[position];
});
System.create({
    kernel: "cpu",
    components: { read: [cell], write: [velocity] },
    lookup: { near: { index: grid, changed: true } },
}, () => {});
System.create({
    // @ts-expect-error only an index lookup's `changed` may be true
    lookup: { player: { read: [health], changed: true } },
}, () => {});
System.create({
    // @ts-expect-error `changed` is true or a list of components
    lookup: { living: { index: living, changed: false } },
}, () => {});
// @ts-expect-error a finalizer runs on each entity that stops matching, so its lookups' `changed` is never true
Finalizer.create({ components: { read: [owner] }, lookup: { tasks: { index: tasksOf, changed: true } } }, () => {});
