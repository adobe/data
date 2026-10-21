import { Resource } from './resource.js';

const gravity = Symbol("declarationTypeTest/gravity");
const total = Symbol("declarationTypeTest/total");
const names = Symbol("declarationTypeTest/names");
const tags = Symbol("declarationTypeTest/tags");
const selected = Symbol("declarationTypeTest/selected");
const device = Symbol("declarationTypeTest/device");
const page = Symbol("declarationTypeTest/page");
const handles = Symbol("declarationTypeTest/handles");

declare module '@adobe/ecs' {
    export interface Resources {
        [gravity]: { type: number };
        [total]: { type: number; reduce: "+" };
        [names]: { type: ReadonlyMap<string, number> };
        [tags]: { type: ReadonlySet<string> };
        [selected]: { type: string | null };
        [device]: { type: GPUDevice | null };
        [page]: { type: Document; thread: "main" };
        [handles]: { type: Map<string, number> };
    }
}

const namesSchema = { type: "map", keys: { type: "string" }, values: { type: "number" } } as const;

// A resource starts at its schema's default or its declaration's.
Resource.register(gravity, { type: { type: "number", default: -9.8 } });
Resource.register(total, { type: { type: "number", default: 0 }, reduce: "+" });
Resource.register(names, { type: namesSchema, default: new Map() });
Resource.register(tags, { type: { type: "set", items: { type: "string" } }, default: new Set(["a"]) });
// A type that allows null starts at null without one.
Resource.register(selected, { type: { anyOf: [{ type: "string" }, { type: "null" }] } });
Resource.register(device, {});
Resource.register(page, { default: document, thread: "main" });
Resource.register(handles, { default: new Map() });

// A schema describes exactly the declared type.
// @ts-expect-error a string isn't a number
Resource.register(gravity, { type: { type: "string", default: "" } });
// @ts-expect-error a map's values are numbers
Resource.register(names, { type: { type: "map", keys: { type: "string" }, values: { type: "string" } }, default: new Map() });

// Every declared trait is registered, with its declared value, and nothing undeclared is.
// @ts-expect-error a declared trait is missing
Resource.register(total, { type: { type: "number", default: 0 } });
// @ts-expect-error an undeclared trait is given
Resource.register(gravity, { type: { type: "number", default: 0 }, reduce: "+" });
// @ts-expect-error a trait's value differs from the declared one
Resource.register(total, { type: { type: "number", default: 0 }, reduce: "max" });
// A declaration held in a constant gets no excess property check, so the types name each undeclared trait.
const reduced = { type: { type: "number", default: 0 }, reduce: "+" } as const;
// @ts-expect-error an undeclared trait is given
Resource.register(gravity, reduced);

// A type that's data is registered with its schema; one that isn't data has none.
// @ts-expect-error a map of strings to numbers is data, so it has a schema
Resource.register(names, { default: new Map() });
// @ts-expect-error a string is data, so it has a schema, though it may start at null
Resource.register(selected, {});
// @ts-expect-error a value that isn't data has no schema
Resource.register(handles, { type: { type: "object", properties: {} }, default: new Map() });

// A default is a value of the declared type, given once.
// @ts-expect-error the schema's default isn't a number
Resource.register(gravity, { type: { type: "number", default: "down" } });
// @ts-expect-error the declaration's default isn't a map of strings to numbers
Resource.register(names, { type: namesSchema, default: new Set() });
// @ts-expect-error a default isn't a Map
Resource.register(handles, { default: "map" });
// @ts-expect-error a type without null starts at a default
Resource.register(gravity, { type: { type: "number" } });
// @ts-expect-error a value that isn't data, without null, starts at a default
Resource.register(handles, {});
// @ts-expect-error a schema's default and the declaration's can't both be given
Resource.register(gravity, { type: { type: "number", default: 0 }, default: 1 });
