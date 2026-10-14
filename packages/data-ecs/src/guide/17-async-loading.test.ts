import { expect, it } from "vitest";
import { Component, Entity, Finalizer, Resource, Rule, System, World } from "../index.js";

const meshSource = "guide/loading/meshSource";
const hidden = "guide/loading/hidden";
const meshSlot = "guide/loading/meshSlot";
const meshReady = "guide/loading/meshReady";
const nextToken = "guide/loading/nextToken";
const requests = "guide/loading/requests";

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
    interface Rules {
        "guide/loading/slots": true;
    }
    interface Finalizers {
        "guide/loading/release": true;
    }
    interface Systems {
        "guide/loading/spawn": true;
        "guide/loading/request": true;
        "guide/loading/apply": true;
        "guide/loading/hide": true;
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
const slots = Rule.create({ name: "guide/loading/slots", query: { has: [meshSource], not: [hidden] }, derives: [meshSlot] });

// 2. Each new slot gets a fresh token, and its load is requested; the application starts requested loads.
const request = System.create({
    name: "guide/loading/request",
    query: { read: [meshSource], write: [meshSlot], added: [meshSlot] },
    resources: { read: [nextToken, requests], write: [nextToken, requests] },
}, (row, context) => {
    const token = context[nextToken];
    context[nextToken] = token + 1;
    row[meshSlot] = token;
    context[requests] = [...context[requests], { entity: row.entity, token, path: row[meshSource] }];
});

// 3. A completed load arrives as a run of its own. A slot whose token still matches gets the mesh; a stale one releases it.
const apply = System.create({
    name: "guide/loading/apply",
    args: { type: "object", properties: { entity: Entity.schema, token: { type: "integer" }, handle: { type: "integer" } } },
    lookup: { slots: { read: [meshSlot] } },
}, (_, { args, slots }, commands) => {
    if (slots(args.entity)?.[meshSlot] === args.token) commands.add(args.entity, { [meshReady]: args.handle });
    else loaded.delete(args.handle);
});

// 4. When the slot goes, its mesh goes with it, and the finalizer releases what was loaded.
const release = Finalizer.create({ name: "guide/loading/release", query: { read: [meshReady] } }, row => { loaded.delete(row[meshReady]); });

const spawn = System.create({ name: "guide/loading/spawn" }, (_, __, commands) => {
    commands.spawn({ [meshSource]: "ship.glb" });
    commands.spawn({ [meshSource]: "rock.glb" });
});
const hide = System.create({ name: "guide/loading/hide", args: Entity.schema }, (_, { args }, commands) => { commands.add(args, { [hidden]: true }); });

it("loads resources asynchronously for derived slots, and releases them when the slot goes", async () => {
    await using world = await World.create({ systems: [slots, request, apply, release, spawn, hide] });
    await world.run(spawn);
    await world.run(request);
    const [ship, rock] = world.read.resource(requests);
    // The rock is hidden before its load completes, so its result is stale when it arrives.
    await world.run(hide, rock.entity);
    for (const { entity, token, path } of [ship, rock]) await world.run(apply, { entity, token, handle: await load(path) });
    expect(world.query.select([meshReady]).map(entity => loaded.get(world.read.component(entity, meshReady) ?? 0))).toEqual(["ship.glb"]);
    expect([...loaded.values()]).toEqual(["ship.glb"]);
    await world.run(hide, ship.entity);
    expect(world.query.count([meshReady])).toBe(0);
    expect(loaded.size).toBe(0);
});
