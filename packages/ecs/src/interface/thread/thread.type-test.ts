// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Component } from '../component/component.js';
import type { IsNode, IsTransferable } from '../platform/platform.js';
import { Resource } from '../resource/resource.js';
import type { ThreadOf } from './of.js';
import type { Thread } from './thread.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

// Threads are augmentable; `world` and `main` are built in.
declare module '@adobe/ecs' {
    export interface Threads {
        threadTypeTest: true;
    }
}
check<Equal<Extract<Thread, "world" | "main" | "threadTypeTest">, "world" | "main" | "threadTypeTest">>();
// @ts-expect-error a thread is a declared one
const undeclared: Thread = "elsewhere";
void undeclared;

const label = Symbol("threadTypeTest/label");
const path = Symbol("threadTypeTest/path");
const handle = Symbol("threadTypeTest/handle");
const position = Symbol("threadTypeTest/position");
const element = Symbol("threadTypeTest/element");
const maybeElement = Symbol("threadTypeTest/maybeElement");
const bitmap = Symbol("threadTypeTest/bitmap");
const buffer = Symbol("threadTypeTest/buffer");
const canvas = Symbol("threadTypeTest/canvas");
const cache = Symbol("threadTypeTest/cache");
const port = Symbol("threadTypeTest/port");
const names = Symbol("threadTypeTest/names");

declare module '@adobe/ecs' {
    export interface Components {
        // Objects: on "world" without `thread`, or on the thread they name.
        [path]: { type: readonly number[]; thread: "threadTypeTest" };
        [handle]: { type: Map<string, number>; thread: "world" };
        // Strings and structs live in shared memory, so they have no thread; World.create rejects one with it.
        [label]: { type: string };
        [position]: { type: readonly [number, number, number] };
        // A DOM Node lives on "main", and says so; the build rejects one without it.
        [element]: { type: HTMLElement; thread: "main" };
        [maybeElement]: { type: HTMLCanvasElement | null; thread: "main" };
        // Transferable values may be moved, never copied, to their thread.
        [bitmap]: { type: ImageBitmap; thread: "threadTypeTest"; transfer: true };
        [buffer]: { type: ArrayBuffer; transfer: true };
    }
    export interface Resources {
        [canvas]: { type: OffscreenCanvas | null; thread: "threadTypeTest"; transfer: true };
        [cache]: { type: Map<string, number> | null; thread: "main" };
        [port]: { type: MessagePort | null; transfer: true };
        [names]: { type: Map<string, number>; thread: "main" };
    }
}

check<Equal<Component.Value<typeof path>, readonly number[]>>();
check<Equal<ThreadOf<{ readonly thread: "main" }, string>, never>>();
check<Equal<ThreadOf<{ readonly thread: "main" }, "edit" | "view">, never>>();
check<Equal<ThreadOf<{ readonly thread: "main" }, readonly string[]>, "main">>();
check<Equal<ThreadOf<{ readonly thread: "main" }, string | null>, never>>();
check<Equal<ThreadOf<{}, null>, "world">>();

// The checks resolve to no check where the DOM library isn't loaded: a scope without `Node` has no DOM Node type.
type NoDom = { readonly ArrayBuffer: { readonly prototype: ArrayBuffer } };
check<Equal<IsNode<HTMLElement>, true>>();
check<Equal<IsNode<HTMLElement | null>, true>>();
check<Equal<IsNode<HTMLElement, NoDom>, false>>();
check<Equal<IsNode<string>, false>>();
check<Equal<IsTransferable<ImageBitmap | null>, true>>();
check<Equal<IsTransferable<ImageBitmap, NoDom>, false>>();
check<Equal<IsTransferable<ArrayBuffer, NoDom>, true>>();
check<Equal<IsTransferable<SharedArrayBuffer>, false>>();
check<Equal<IsTransferable<null>, false>>();
