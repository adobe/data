import { Component } from '../component/component.js';
import type { IsNode, IsTransferable } from '../platform/platform.js';
import { Resource } from '../resource/resource.js';
import type { Thread } from './thread.js';

type Equal<X, Y> = (<T>() => T extends X ? 1 : 2) extends (<T>() => T extends Y ? 1 : 2) ? true : false;
const check = <_T extends true>() => { };

// Threads are augmentable; `world` and `main` are built in.
declare module '@adobe/data-ecs' {
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

declare module '@adobe/data-ecs' {
    export interface Components {
        // Objects: on "world" without `thread`, or on the thread they name.
        [label]: typeof labelTraits;
        [path]: typeof pathTraits;
        [handle]: typeof handleTraits;
        [placedLabel]: typeof placedLabelTraits;
        [unknownThread]: typeof unknownThreadTraits;
        // Structs live in shared memory, so they have no thread.
        [position]: typeof positionTraits;
        [placedPosition]: typeof placedPositionTraits;
        [placedTag]: typeof placedTagTraits;
        // A DOM Node lives on "main", and says so.
        [element]: typeof elementTraits;
        [unplacedElement]: typeof unplacedElementTraits;
        [workerElement]: typeof workerElementTraits;
        [maybeElement]: typeof maybeElementTraits;
        // Transferable values may be moved, never copied, to their thread.
        [bitmap]: typeof bitmapTraits;
        [buffer]: typeof bufferTraits;
        [notTransferable]: typeof notTransferableTraits;
    }
    export interface Resources {
        [canvas]: typeof canvasTraits;
        [cache]: typeof cacheTraits;
        [count]: typeof countTraits;
        [port]: typeof portTraits;
        [text]: typeof textTraits;
    }
}

const labelTraits = Component.register(label, { type: { type: "string" } });
const pathTraits = Component.register(path, { type: { type: "array", items: { type: "number" } }, thread: "threadTypeTest" });
const handleTraits = Component.register(handle, { type: Component.object<Map<string, number>>(), thread: "world" });
const placedLabelTraits = Component.register(placedLabel, { type: { type: "string" }, thread: "main" });
const positionTraits = Component.register(position, { type: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 } });
const elementTraits = Component.register(element, { type: Component.object<HTMLElement>(), thread: "main" });
const maybeElementTraits = Component.register(maybeElement, { type: Component.object<HTMLCanvasElement | null>(), thread: "main" });
const bitmapTraits = Component.register(bitmap, { type: Component.object<ImageBitmap>(), thread: "threadTypeTest", transfer: true });
const bufferTraits = Component.register(buffer, { type: Component.object<ArrayBuffer>(), transfer: true });
const canvasTraits = Resource.register(canvas, { type: Resource.object<OffscreenCanvas | null>(), thread: "threadTypeTest", transfer: true });
const cacheTraits = Resource.register(cache, { type: Resource.object<Map<string, number> | null>(), thread: "main" });
const portTraits = Resource.register(port, { type: Resource.object<MessagePort | null>(), transfer: true });

// @ts-expect-error a thread is a declared one
const unknownThreadTraits = Component.register(unknownThread, { type: { type: "string" }, thread: "elsewhere" });
// @ts-expect-error a struct lives in shared memory, so it has no thread
const placedPositionTraits = Component.register(placedPosition, { type: { type: "array", items: { type: "number" }, minItems: 3, maxItems: 3 }, thread: "main" });
// @ts-expect-error a tag is a struct too
const placedTagTraits = Component.register(placedTag, { type: { const: true }, thread: "world" });
// @ts-expect-error a struct resource has no thread either
const countTraits = Resource.register(count, { type: { type: "number", default: 0 }, thread: "main" });
// @ts-expect-error a DOM Node declares thread: "main"
const unplacedElementTraits = Component.register(unplacedElement, { type: Component.object<HTMLElement>() });
// @ts-expect-error a DOM Node lives on "main", not another thread
const workerElementTraits = Component.register(workerElement, { type: Component.object<HTMLElement>(), thread: "threadTypeTest" });
// @ts-expect-error only a Transferable value is moved
const notTransferableTraits = Component.register(notTransferable, { type: Component.object<Map<string, number>>(), transfer: true });
// @ts-expect-error a string is data, copied, never moved
const textTraits = Resource.register(text, { type: { type: "string", default: "" }, transfer: true });
// @ts-expect-error a value that's data has a schema, not object<T>()
Component.register(label, { type: Component.object<string>() });
// @ts-expect-error an object's default is the declaration's, beside object<T>(): a component's comes from commands
Component.register(handle, { type: Component.object<Map<string, number>>(), default: new Map(), thread: "world" });
// @ts-expect-error a resource without null starts at a default
Resource.register(cache, { type: Resource.object<Map<string, number>>(), thread: "main" });
// @ts-expect-error a default is a value of the type
Resource.register(cache, { type: Resource.object<Map<string, number>>(), default: "map", thread: "main" });

// An object's entry is the type object<T>() states, with its traits.
check<Equal<typeof elementTraits, { readonly type: HTMLElement; readonly thread: "main" }>>();
check<Equal<typeof cacheTraits, { readonly type: Map<string, number> | null; readonly thread: "main" }>>();
check<Equal<Component.Value<typeof path>, readonly number[]>>();

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
