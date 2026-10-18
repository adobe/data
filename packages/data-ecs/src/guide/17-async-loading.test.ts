import { expect, it } from "vitest";
import { Component, Entity, Finalizer, Resource, Rule, System, World } from "../index.js";
import { toPromise } from "../interface/observe/to-promise.js";
import { createWorld } from "../implementation/index.js";

const meshSource = Symbol("guide/loading/meshSource");
const hidden = Symbol("guide/loading/hidden");
const meshSlot = Symbol("guide/loading/meshSlot");
const meshReady = Symbol("guide/loading/meshReady");
const nextToken = Symbol("guide/loading/nextToken");
const requests = Symbol("guide/loading/requests");

type Request = { readonly entity: Entity; readonly token: number; readonly path: string };

declare module "@adobe/data-ecs" {
    interface Components {
        [meshSource]: { type: string };
        [hidden]: { type: true };
        /** The token of the slot's load; a new one each time the slot starts over. */
        [meshSlot]: { type: number; derived: true };
        /** The loaded mesh's handle, which exists only while its slot does. */
        [meshReady]: { type: number; within: typeof meshSlot };
    }
    interface Resources {
        [nextToken]: { type: number };
        [requests]: { type: readonly Request[] };
    }
}

Component.register(meshSource, { type: { type: "string" } });
Component.register(hidden, { type: { const: true } });
Component.register(meshSlot, { type: { type: "integer", default: 0 }, derived: true });
Component.register(meshReady, { type: { type: "integer" }, within: meshSlot });
Resource.register(nextToken, { type: { type: "integer", default: 1 } });
Resource.register(requests, {
    type: {
        type: "array",
        items: { type: "object", properties: { entity: Entity.schema, token: { type: "integer" }, path: { type: "string" } } },
        default: [],
    },
});

/** Meshes loaded outside the world, by handle: as GPU buffers are. */
const loaded = new Map<number, string>();
let nextHandle = 1;
const load = async (path: string): Promise<number> => {
    loaded.set(nextHandle, path);
    return nextHandle++;
};

// 1. A rule derives a slot for every visible entity with a mesh source.
Rule.create({ name: "guide/loading/slots", components: { has: [meshSource], not: [hidden] }, derive: [meshSlot] });

// 2. Each new slot gets a fresh token, and its load is requested; the application starts requested loads.
const request = System.create({
    name: "guide/loading/request",
    components: { read: [meshSource], write: [meshSlot], added: [meshSlot] },
    resources: { write: [nextToken, requests] },
}, (row, { resources }) => {
    const token = resources[nextToken];
    resources[nextToken] = token + 1;
    row[meshSlot] = token;
    resources[requests] = [...resources[requests], { entity: row.entity, token, path: row[meshSource] }];
});

// 3. A completed load arrives as a run of its own. A slot whose token still matches gets the mesh; a stale one releases it.
const apply = System.create({
    name: "guide/loading/apply",
    input: { type: "object", properties: { entity: Entity.schema, token: { type: "integer" }, handle: { type: "integer" } } },
    lookup: { slots: { read: [meshSlot] } },
}, ({ input, lookup, commands }) => {
    if (lookup.slots(input.entity)?.[meshSlot] === input.token) commands.add(input.entity, { [meshReady]: input.handle });
    else loaded.delete(input.handle);
});

// 4. When the slot goes, its mesh goes with it, and the finalizer releases what was loaded.
Finalizer.create({ name: "guide/loading/release", components: { read: [meshReady] } }, row => { loaded.delete(row[meshReady]); });

const spawn = System.create({ name: "guide/loading/spawn" }, ({ commands }) => {
    commands.spawn({ [meshSource]: "ship.glb" });
    commands.spawn({ [meshSource]: "rock.glb" });
});
const hide = System.create({ name: "guide/loading/hide", input: { type: "object", properties: { entity: Entity.schema } } }, ({ input, commands }) => {
    commands.add(input.entity, { [hidden]: true });
});

it("loads resources asynchronously for derived slots, and releases them when the slot goes", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(request);
    const [ship, rock] = await toPromise(world.observe.resource(requests));
    // The rock is hidden before its load completes, so its result is stale when it arrives.
    await world.run(hide, { entity: rock.entity });
    for (const { entity, token, path } of [ship, rock]) await world.run(apply, { entity, token, handle: await load(path) });
    const ready = await toPromise(world.observe.select({ required: [meshReady] }));
    expect(await Promise.all(ready.map(async entity => loaded.get((await toPromise(world.observe.entity(entity, { required: [meshReady] })))?.[meshReady] ?? 0)))).toEqual(["ship.glb"]);
    expect([...loaded.values()]).toEqual(["ship.glb"]);
    await world.run(hide, { entity: ship.entity });
    expect(await toPromise(world.observe.count({ required: [meshReady] }))).toBe(0);
    expect(loaded.size).toBe(0);
});
