import type { Entity } from '../entity/entity.js';
import { System } from './system.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const local = 'upTypeTest/local';
const world = 'upTypeTest/world';
const parent = 'upTypeTest/parent';
const name = 'upTypeTest/name';

declare module '@adobe/data-ecs' {
    export interface Components {
        [local]: { type: number };
        [world]: { type: number };
        [parent]: { type: Entity; reference: "owner" };
        [name]: { type: string };
    }
}

// `up` reads what `read` lists of the entity `through` names, or null for a row without one; it may read what the system writes.
System.create({
    name: "upTypeTest/propagate",
    kernel: "cpu",
    components: { read: [local], write: [world] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    check<Equal<typeof up, { readonly [world]: number } | null>>();
    row[world] = up === null ? row[local] : up[world] + row[local];
    // @ts-expect-error up's values are read-only
    if (up !== null) up[world] = 0;
});

// Without `up`, the context has none.
System.create({ name: "upTypeTest/none", components: { read: [local] } }, (row, context) => {
    void row[local];
    // @ts-expect-error no up declared
    void context.up;
});

System.create({
    name: "upTypeTest/unreferenced",
    components: { write: [world] },
    // @ts-expect-error through is a reference component
    up: { through: local, read: [world] },
}, () => {});

System.create({
    name: "upTypeTest/text",
    kernel: "cpu",
    components: { write: [world] },
    // @ts-expect-error a kernel's up reads linear values
    up: { through: parent, read: [name] },
}, () => {});

// A GPU kernel reads up too.
System.create({
    name: "upTypeTest/gpu",
    kernel: "gpu",
    components: { read: [local], write: [world] },
    up: { through: parent, read: [world] },
}, (row, { up }) => {
    row[world] = up === null ? row[local] : up[world] + row[local];
});

System.create({
    name: "upTypeTest/rowless",
    // @ts-expect-error up orders rows, so it needs components
    up: { through: parent, read: [world] },
}, () => {});
