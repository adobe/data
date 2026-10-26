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

// A system runs on the thread of the object components and resources it uses; strings and structs go with any. Its
// type places it by what it filters on, conditions and lookup keys; what its body uses places it at registration.
System.create({ components: { with: [position, node] } }, () => {});
System.create({ components: { with: [audio, position] } }, () => {});
System.create({ components: { with: [label] }, resources: { is: [settings] } }, () => {});
System.create({ components: { with: [label, node], not: [audio] } }, () => {});
System.create({ components: { with: [node] }, resources: { not: [settings] } }, () => {});
System.create({ components: { with: [node], changed: [label] }, lookup: { labels: { with: [label] } } }, () => {});
System.create({ components: { with: [tags, node] } }, () => {});

// @ts-expect-error change filters and conditions place it
System.create({ components: { changed: [tags, audio] } }, () => {});
// @ts-expect-error resources and components live on one thread
System.create({ components: { changed: [audio] }, resources: { is: [document] } }, () => {});

// Render systems run on gpuDevice's thread, "world".
System.render({ shader: { accessors: { place: position } } }, () => {});
// @ts-expect-error a render system's resources live with gpuDevice
System.render({ resources: { is: [document] }, shader: { accessors: { place: position } } }, () => {});

// A composite's members may live on different threads.
const render = System.create({ components: { with: [node] } }, () => {});
const play = System.create({ components: { with: [audio] } }, () => {});
export const frame = System.create({ systems: [render, play] });

// Finalizers too run on one thread, which registration finds from what their bodies use. One on another thread than
// the world's, which a joined thread may fill, runs there after the sync point: it issues no commands, writes no
// resources and looks up nothing.
Finalizer.create({ components: { with: [node] } }, () => {});
Finalizer.create({ components: { with: [node, label] } }, () => {});
Finalizer.create({ components: { with: [node, position] } }, (row, context) => {
    row[node].remove();
    void [row[position], context.resources[document], context.resources[time]];
});
// On the world's thread, structs and its objects alike, it does.
Finalizer.create({ components: { with: [label, position] }, lookup: { labels: { with: [label] } } }, (row, { commands, resources, lookup }) => {
    resources[time] = lookup.labels(row.entity)?.[label].length ?? 0;
    commands.despawn(row.entity);
});
// A changes finalizer runs on the world's thread: watching another thread's objects doesn't compile.
Finalizer.changes({ watch: [label, position] }, (_, { commands }) => { void commands; });
// @ts-expect-error a changes finalizer watches no other thread's objects
Finalizer.changes({ watch: [node] }, () => {});

// The error names each object component and resource with its thread; data places nothing.
check<Equal<ThreadedBy<{ readonly components: { readonly changed: [typeof audio, typeof position] }; readonly resources: { readonly is: [typeof document, typeof time] } }>, { readonly [audio]: "threadsTypeTest"; readonly [document]: "main" }>>();
