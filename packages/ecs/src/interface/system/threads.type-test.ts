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
System.create({ name: "threadsTypeTest/render", components: { read: [position], write: [node] }, resources: { read: [time, document] } }, () => {});
System.create({ name: "threadsTypeTest/play", components: { read: [audio, position] } }, () => {});
System.create({ name: "threadsTypeTest/label", components: { write: [label] }, resources: { is: [settings] } }, () => {});
// Presence-only lists don't place a system.
System.create({ name: "threadsTypeTest/count", components: { read: [label], has: [node], not: [audio] }, resources: { read: [time] } }, () => {});
System.create({ name: "threadsTypeTest/paused", components: { read: [node] }, resources: { not: [settings] } }, () => {});
System.create({ name: "threadsTypeTest/caption", components: { read: [label], write: [node] } }, () => {});
System.create({ name: "threadsTypeTest/captionChanged", components: { read: [node], changed: [label] }, lookup: { labels: { read: [label] } } }, () => {});

// @ts-expect-error a system's object components live on one thread
System.create({ name: "threadsTypeTest/both", components: { read: [node, tags] } }, () => {});
// @ts-expect-error writes and change filters place it too
System.create({ name: "threadsTypeTest/changed", components: { write: [tags], changed: [audio] } }, () => {});
// @ts-expect-error a lookup's reads place it too
System.create({ name: "threadsTypeTest/lookup", components: { read: [tags] }, lookup: { nodes: { read: [node] } } }, () => {});
// @ts-expect-error resources and components live on one thread
System.create({ name: "threadsTypeTest/mixed", components: { read: [audio] }, resources: { read: [document] } }, () => {});
// @ts-expect-error a condition it reads places it
System.create({ name: "threadsTypeTest/condition", components: { read: [node] }, resources: { is: [settings] } }, () => {});

// Render systems run on gpuDevice's thread, "world".
System.render({ name: "threadsTypeTest/draw", resources: { read: [settings] }, shader: { accessors: { place: position } } }, () => {});
// @ts-expect-error a render system's resources live with gpuDevice
System.render({ name: "threadsTypeTest/drawNode", resources: { read: [document] }, shader: { accessors: { place: position } } }, () => {});

// A composite's members may live on different threads.
const render = System.create({ name: "threadsTypeTest/renderMember", components: { write: [node] } }, () => {});
const play = System.create({ name: "threadsTypeTest/playMember", components: { write: [audio] } }, () => {});
export const frame = System.create({ name: "threadsTypeTest/frame", systems: [render, play] });

// Finalizers too run on one thread.
Finalizer.create({ name: "threadsTypeTest/release", components: { read: [node] }, resources: { read: [document] } }, () => {});
// @ts-expect-error a finalizer's object components and resources live on one thread
Finalizer.create({ name: "threadsTypeTest/releaseBoth", components: { read: [node, audio] } }, () => {});
Finalizer.create({ name: "threadsTypeTest/releaseCaption", components: { read: [node, label] } }, () => {});

// A finalizer on another thread than the world's, which a joined thread may fill, runs there after the sync point: it
// issues no commands, writes no resources and looks up nothing.
Finalizer.create({ name: "threadsTypeTest/detach", components: { read: [node, position] }, resources: { read: [document, time] } }, (row, context) => {
    row[node].remove();
    void [row[position], context.resources[document], context.resources[time]];
    // @ts-expect-error a finalizer on another thread issues no commands
    void context.commands;
});
Finalizer.create({ name: "threadsTypeTest/silence", components: { read: [audio] } }, (row, context) => {
    void row[audio];
    // @ts-expect-error a finalizer on another thread issues no commands
    void context.commands;
});
// @ts-expect-error a finalizer on another thread writes no resources
Finalizer.create({ name: "threadsTypeTest/detachWriting", components: { read: [node] }, resources: { write: [time] } }, () => {});
// @ts-expect-error a finalizer writing another thread's resource is on that thread
Finalizer.create({ name: "threadsTypeTest/documentWriting", components: { read: [position] }, resources: { write: [document] } }, () => {});
// @ts-expect-error a finalizer on another thread looks up nothing
Finalizer.create({ name: "threadsTypeTest/detachLooking", components: { read: [node] }, lookup: { places: { read: [position] } } }, () => {});
// On the world's thread, structs and its objects alike, it does.
Finalizer.create({ name: "threadsTypeTest/forget", components: { read: [label, position] }, resources: { write: [time] }, lookup: { labels: { read: [label] } } }, (row, { commands, resources, lookup }) => {
    resources[time] = lookup.labels(row.entity)?.[label].length ?? 0;
    commands.despawn(row.entity);
});
// A changes finalizer runs on the world's thread: watching another thread's objects, or reading its resources, doesn't compile.
Finalizer.changes({ name: "threadsTypeTest/save", watch: [label, position], resources: { read: [time] } }, (_, { commands }) => { void commands; });
// @ts-expect-error a changes finalizer watches no other thread's objects
Finalizer.changes({ name: "threadsTypeTest/saveNodes", watch: [node] }, () => {});
// @ts-expect-error a changes finalizer reads no other thread's resources
Finalizer.changes({ name: "threadsTypeTest/saveDocument", resources: { read: [document] } }, () => {});

// The error names each object component and resource with its thread; data places nothing.
check<Equal<ThreadedBy<{ readonly components: { readonly read: [typeof audio, typeof position] }; readonly resources: { readonly read: [typeof document, typeof time] } }>, { readonly [audio]: "threadsTypeTest"; readonly [document]: "main" }>>();
