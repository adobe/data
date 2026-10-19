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
// @ts-expect-error a key is a list of components
Index.create({ key: [] });
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
