// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Resource } from '../resource/resource.js';
import { Component } from '../component/component.js';
import { Finalizer } from '../finalizer/finalizer.js';
import { System } from './system.js';
import type { ThreadedBy } from './threads.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

const node = Symbol("threadsTypeTest/node");
const label = Symbol("threadsTypeTest/label");
const audio = Symbol("threadsTypeTest/audio");
const position = Symbol("threadsTypeTest/position");
const document = Symbol("threadsTypeTest/document");
const settings = Symbol("threadsTypeTest/settings");
const time = Symbol("threadsTypeTest/time");
const tags = Symbol("threadsTypeTest/tags");

declare module '@adobe/ecs' {
    export interface Threads {
        threadsTypeTest: true;
    }
    export interface Components {
        [node]: { type: HTMLElement; thread: "main" };
        [label]: { type: string };
        [audio]: { type: AudioBuffer; thread: "threadsTypeTest" };
        [position]: { type: readonly [number, number] };
        [tags]: { type: readonly string[] };
    }
    export interface Resources {
        [document]: { type: Document | null; thread: "main" };
        [settings]: { type: { readonly name: string } | null };
        [time]: { type: number };
    }
}

// A system runs on the thread of the object components and resources it uses; strings and structs go with any.
System.create({ components: { read: [position], write: [node] }, resources: { read: [time, document] } }, () => {});
System.create({ components: { read: [audio, position] } }, () => {});
System.create({ components: { write: [label] }, resources: { is: [settings] } }, () => {});
// Presence-only lists don't place a system.
System.create({ components: { read: [label], has: [node], not: [audio] }, resources: { read: [time] } }, () => {});
System.create({ components: { read: [node] }, resources: { not: [settings] } }, () => {});
System.create({ components: { read: [label], write: [node] } }, () => {});
System.create({ components: { read: [node], changed: [label] }, lookup: { labels: { read: [label] } } }, () => {});

// @ts-expect-error a system's object components live on one thread
System.create({ components: { read: [node, tags] } }, () => {});
// @ts-expect-error writes and change filters place it too
System.create({ components: { write: [tags], changed: [audio] } }, () => {});
// @ts-expect-error a lookup's reads place it too
System.create({ components: { read: [tags] }, lookup: { nodes: { read: [node] } } }, () => {});
// @ts-expect-error resources and components live on one thread
System.create({ components: { read: [audio] }, resources: { read: [document] } }, () => {});
// @ts-expect-error a condition it reads places it
System.create({ components: { read: [node] }, resources: { is: [settings] } }, () => {});

// Render systems run on gpuDevice's thread, "world".
System.render({ resources: { read: [settings] }, shader: { accessors: { place: position } } }, () => {});
// @ts-expect-error a render system's resources live with gpuDevice
System.render({ resources: { read: [document] }, shader: { accessors: { place: position } } }, () => {});

// A composite's members may live on different threads.
const render = System.create({ components: { write: [node] } }, () => {});
const play = System.create({ components: { write: [audio] } }, () => {});
export const frame = System.create({ systems: [render, play] });

// Finalizers too run on one thread.
Finalizer.create({ components: { read: [node] }, resources: { read: [document] } }, () => {});
// @ts-expect-error a finalizer's object components and resources live on one thread
Finalizer.create({ components: { read: [node, audio] } }, () => {});
Finalizer.create({ components: { read: [node, label] } }, () => {});

// A finalizer on another thread than the world's, which a joined thread may fill, runs there after the sync point: it
// issues no commands, writes no resources and looks up nothing.
Finalizer.create({ components: { read: [node, position] }, resources: { read: [document, time] } }, (row, context) => {
    row[node].remove();
    void [row[position], context.resources[document], context.resources[time]];
    // @ts-expect-error a finalizer on another thread issues no commands
    void context.commands;
});
Finalizer.create({ components: { read: [audio] } }, (row, context) => {
    void row[audio];
    // @ts-expect-error a finalizer on another thread issues no commands
    void context.commands;
});
// @ts-expect-error a finalizer on another thread writes no resources
Finalizer.create({ components: { read: [node] }, resources: { write: [time] } }, () => {});
// @ts-expect-error a finalizer writing another thread's resource is on that thread
Finalizer.create({ components: { read: [position] }, resources: { write: [document] } }, () => {});
// @ts-expect-error a finalizer on another thread looks up nothing
Finalizer.create({ components: { read: [node] }, lookup: { places: { read: [position] } } }, () => {});
// On the world's thread, structs and its objects alike, it does.
Finalizer.create({ components: { read: [label, position] }, resources: { write: [time] }, lookup: { labels: { read: [label] } } }, (row, { commands, resources, lookup }) => {
    resources[time] = lookup.labels(row.entity)?.[label].length ?? 0;
    commands.despawn(row.entity);
});
// A changes finalizer runs on the world's thread: watching another thread's objects, or reading its resources, doesn't compile.
Finalizer.changes({ watch: [label, position], resources: { read: [time] } }, (_, { commands }) => { void commands; });
// @ts-expect-error a changes finalizer watches no other thread's objects
Finalizer.changes({ watch: [node] }, () => {});
// @ts-expect-error a changes finalizer reads no other thread's resources
Finalizer.changes({ resources: { read: [document] } }, () => {});

// The error names each object component and resource with its thread; data places nothing.
check<Equal<ThreadedBy<{ readonly components: { readonly read: [typeof audio, typeof position] }; readonly resources: { readonly read: [typeof document, typeof time] } }>, { readonly [audio]: "threadsTypeTest"; readonly [document]: "main" }>>();
