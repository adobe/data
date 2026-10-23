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
const placedLabel = Symbol("threadTypeTest/placedLabel");
const unknownThread = Symbol("threadTypeTest/unknownThread");
const position = Symbol("threadTypeTest/position");
const placedPosition = Symbol("threadTypeTest/placedPosition");
const placedTag = Symbol("threadTypeTest/placedTag");
const element = Symbol("threadTypeTest/element");
const unplacedElement = Symbol("threadTypeTest/unplacedElement");
const workerElement = Symbol("threadTypeTest/workerElement");
const maybeElement = Symbol("threadTypeTest/maybeElement");
const bitmap = Symbol("threadTypeTest/bitmap");
const buffer = Symbol("threadTypeTest/buffer");
const notTransferable = Symbol("threadTypeTest/notTransferable");
const canvas = Symbol("threadTypeTest/canvas");
const cache = Symbol("threadTypeTest/cache");
const count = Symbol("threadTypeTest/count");
const port = Symbol("threadTypeTest/port");
const text = Symbol("threadTypeTest/text");
const names = Symbol("threadTypeTest/names");
const mode = Symbol("threadTypeTest/mode");
const caption = Symbol("threadTypeTest/caption");

declare module '@adobe/ecs' {
    export interface Components {
        // Objects: on "world" without `thread`, or on the thread they name.
        [path]: { type: readonly number[]; thread: "threadTypeTest" };
        [handle]: { type: Map<string, number>; thread: "world" };
        [unknownThread]: { type: readonly number[]; thread: "elsewhere" };
        // Strings and structs live in shared memory, so they have no thread.
        [label]: { type: string };
        [placedLabel]: { type: string; thread: "main" };
        [position]: { type: readonly [number, number, number] };
        [placedPosition]: { type: readonly [number, number, number]; thread: "main" };
        [placedTag]: { type: true; thread: "world" };
        // A DOM Node lives on "main", and says so.
        [element]: { type: HTMLElement; thread: "main" };
        [unplacedElement]: { type: HTMLElement };
        [workerElement]: { type: HTMLElement; thread: "threadTypeTest" };
        [maybeElement]: { type: HTMLCanvasElement | null; thread: "main" };
        // Transferable values may be moved, never copied, to their thread.
        [bitmap]: { type: ImageBitmap; thread: "threadTypeTest"; transfer: true };
        [buffer]: { type: ArrayBuffer; transfer: true };
        [notTransferable]: { type: Map<string, number>; transfer: true };
    }
    export interface Resources {
        [canvas]: { type: OffscreenCanvas | null; thread: "threadTypeTest"; transfer: true };
        [cache]: { type: Map<string, number> | null; thread: "main" };
        [count]: { type: number; thread: "main" };
        [port]: { type: MessagePort | null; transfer: true };
        [text]: { type: string; transfer: true };
        [names]: { type: Map<string, number>; thread: "main" };
        [mode]: { type: "edit" | "view"; thread: "main" };
        [caption]: { type: string | null; thread: "main" };
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
