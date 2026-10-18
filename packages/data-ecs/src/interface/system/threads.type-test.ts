import { Finalizer } from '../finalizer/finalizer.js';
import { System } from './system.js';

const node = Symbol("threadsTypeTest/node");
const label = Symbol("threadsTypeTest/label");
const audio = Symbol("threadsTypeTest/audio");
const position = Symbol("threadsTypeTest/position");
const document = Symbol("threadsTypeTest/document");
const settings = Symbol("threadsTypeTest/settings");
const time = Symbol("threadsTypeTest/time");

declare module '@adobe/data-ecs' {
    export interface Threads {
        threadsTypeTest: true;
    }
    export interface Components {
        [node]: { type: HTMLElement; thread: "main" };
        [label]: { type: string };
        [audio]: { type: AudioBuffer; thread: "threadsTypeTest" };
        [position]: { type: readonly [number, number] };
    }
    export interface Resources {
        [document]: { type: Document | null; thread: "main" };
        [settings]: { type: { readonly name: string } | null };
        [time]: { type: number };
    }
}

// A system runs on the thread of the object components and resources it uses; structs go with any.
System.create({ name: "threadsTypeTest/render", components: { read: [position], write: [node] }, resources: { read: [time, document] } }, () => {});
System.create({ name: "threadsTypeTest/play", components: { read: [audio, position] } }, () => {});
System.create({ name: "threadsTypeTest/label", components: { write: [label] }, resources: { is: [settings] } }, () => {});
// Presence-only lists don't place a system.
System.create({ name: "threadsTypeTest/count", components: { read: [label], has: [node], not: [audio] }, resources: { read: [time] } }, () => {});
System.create({ name: "threadsTypeTest/paused", components: { read: [node] }, resources: { not: [settings] } }, () => {});

// @ts-expect-error a system's object components live on one thread
System.create({ name: "threadsTypeTest/both", components: { read: [node, label] } }, () => {});
// @ts-expect-error writes and change filters place it too
System.create({ name: "threadsTypeTest/changed", components: { write: [label], changed: [audio] } }, () => {});
// @ts-expect-error a lookup's reads place it too
System.create({ name: "threadsTypeTest/lookup", components: { read: [label] }, lookup: { nodes: { read: [node] } } }, () => {});
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
export const frame = System.composite({ name: "threadsTypeTest/frame", systems: [render, play] });

// Finalizers too run on one thread.
Finalizer.create({ name: "threadsTypeTest/release", components: { read: [node] }, resources: { write: [document] } }, () => {});
// @ts-expect-error a finalizer's object components and resources live on one thread
Finalizer.create({ name: "threadsTypeTest/releaseBoth", components: { read: [node, audio] } }, () => {});
