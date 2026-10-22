import { expect, it } from "vitest";
import { Component, Entity, Finalizer, Resource, Rule, System, World } from "../../index.js";
import { Observe } from "../../observe/index.js";
import { createWorld } from "../index.js";

const meshSource = Symbol("asyncLoading/meshSource");
const hidden = Symbol("asyncLoading/hidden");
const meshSlot = Symbol("asyncLoading/meshSlot");
const meshReady = Symbol("asyncLoading/meshReady");
const nextToken = Symbol("asyncLoading/nextToken");
const requests = Symbol("asyncLoading/requests");

type Request = { readonly entity: Entity; readonly token: number; readonly path: string };

declare module "@adobe/ecs" {
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
        [requests]: { type: readonly { readonly entity: Entity; readonly token: number; readonly path: string }[] };
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
Rule.create({ name: "asyncLoading/slots", components: { has: [meshSource], not: [hidden] }, derive: [meshSlot] });

// 2. Each new slot gets a fresh token, and its load is requested; the application starts requested loads.
const request = System.create({
    name: "asyncLoading/request",
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
    name: "asyncLoading/apply",
    input: { type: "object", properties: { entity: Entity.schema, token: { type: "integer" }, handle: { type: "integer" } } },
    lookup: { slots: { read: [meshSlot] } },
}, ({ input, lookup, commands }) => {
    if (lookup.slots(input.entity)?.[meshSlot] === input.token) commands.add(input.entity, meshReady, input.handle);
    else loaded.delete(input.handle);
});

// 4. When the slot goes, its mesh goes with it, and the finalizer releases what was loaded.
Finalizer.create({ name: "asyncLoading/release", components: { read: [meshReady] } }, row => { loaded.delete(row[meshReady]); });

const spawn = System.create({ name: "asyncLoading/spawn" }, ({ commands }) => {
    commands.spawn([meshSource])({ [meshSource]: "ship.glb" });
    commands.spawn([meshSource])({ [meshSource]: "rock.glb" });
});
const hide = System.create({ name: "asyncLoading/hide", input: { type: "object", properties: { entity: Entity.schema } } }, ({ input, commands }) => {
    commands.add(input.entity, hidden);
});

it("loads resources asynchronously for derived slots, and releases them when the slot goes", async () => {
    await using world = createWorld();
    await world.run(spawn);
    await world.run(request);
    const [ship, rock] = await Observe.toPromise(Observe.resource(world, requests));
    // The rock is hidden before its load completes, so its result is stale when it arrives.
    await world.run(hide, { entity: rock.entity });
    for (const { entity, token, path } of [ship, rock]) await world.run(apply, { entity, token, handle: await load(path) });
    const ready = await Observe.toPromise(Observe.select(world, { required: [meshReady] }));
    expect(await Promise.all(ready.map(async entity => loaded.get((await Observe.toPromise(Observe.entity(world, entity, { required: [meshReady] })))?.[meshReady] ?? 0)))).toEqual(["ship.glb"]);
    expect([...loaded.values()]).toEqual(["ship.glb"]);
    await world.run(hide, { entity: ship.entity });
    expect(await Observe.toPromise(Observe.count(world, { required: [meshReady] }))).toBe(0);
    expect(loaded.size).toBe(0);
});
