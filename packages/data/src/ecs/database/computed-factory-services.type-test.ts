// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createPlugin } from "./create-plugin.js";
import { Database } from "./database.js";
import type { Observe } from "../../observe/index.js";
import type { Assert } from "../../types/assert.js";
import type { Equal } from "../../types/equal.js";

/**
 * A declared service must keep its full type when read from a `computed`
 * factory's `db.services.<name>`.
 *
 * This was reported as lost — a `computed` factory reading a service off the
 * extended chain saw it as `unknown`, forcing a cast at the boundary. On the
 * current type surface the service type is threaded correctly (the
 * computed-factory `db` is built by `FullDBForPlugin`, whose service slot is
 * `FromServiceFactories<RemoveIndex<SVF> & XP['services']>`), so these positive
 * checks hold. This file pins that behavior so the loss cannot silently return.
 *
 * The check is exercised across every shape that reported the loss: the service
 * on an `extends` base, on a combined base, declared locally in the same call,
 * and imported — including the case where the service factory itself reads a
 * further chain service. The asymmetry originally cited (a `systems` `create`
 * body and the fully-resolved `Database.FromPlugin<...>['services']` typed the
 * same service correctly) is pinned too.
 */

type Thing = { readonly id: number };
type HostThing = { readonly hostId: number };

const servicePlugin = createPlugin({
    services: {
        imageCompositor: (_db): Observe<Thing | null> => (() => () => {}),
    },
});

// 1. Service on an `extends` base — read from a computed factory.
createPlugin({
    extends: servicePlugin,
    computed: {
        probe: (db): Observe<unknown> => {
            type Svc = typeof db.services.imageCompositor;
            type _Ok = Assert<Equal<Svc, Observe<Thing | null>>>;
            // Negative guard: a service that was never declared is absent.
            // @ts-expect-error — `missing` is not a declared service.
            db.services.missing;
            return (() => () => {});
        },
    },
});

// 2. Service declared LOCALLY in the same create as the computed.
createPlugin({
    services: {
        imageCompositor: (_db): Observe<Thing | null> => (() => () => {}),
    },
    computed: {
        probe: (db): Observe<unknown> => {
            type Svc = typeof db.services.imageCompositor;
            type _Ok = Assert<Equal<Svc, Observe<Thing | null>>>;
            return (() => () => {});
        },
    },
});

// 3. Service via `imports`.
createPlugin({
    imports: servicePlugin,
    computed: {
        probe: (db): Observe<unknown> => {
            type Svc = typeof db.services.imageCompositor;
            type _Ok = Assert<Equal<Svc, Observe<Thing | null>>>;
            return (() => () => {});
        },
    },
});

// 4. Faithful multi-layer chain: a service on a plugin that `extends` a
//    `combine`, whose factory reads a further chain service; the type must
//    still survive one layer down in a computed.
const hostPlugin = createPlugin({
    services: {
        host: (_db): HostThing => { throw new Error("inject"); },
    },
});
const scenePlugin = createPlugin({
    components: { sceneName: { type: "string" } },
});
const servicesPlugin = createPlugin({
    extends: Database.Plugin.combine(scenePlugin, hostPlugin),
    services: {
        imageCompositor: (db): Observe<Thing | null> => {
            const _h: HostThing = db.services.host; // reads a chain service
            return (() => () => {});
        },
    },
});
createPlugin({
    extends: servicesPlugin,
    computed: {
        status: (db): Observe<unknown> => {
            type Svc = typeof db.services.imageCompositor;
            type _Ok = Assert<Equal<Svc, Observe<Thing | null>>>;
            return (() => () => {});
        },
    },
});

// 5. Asymmetry pins — the same service typed correctly on a `systems` create
//    body and on the fully-resolved FromPlugin services surface.
createPlugin({
    extends: servicePlugin,
    systems: {
        probeSys: {
            create: (db) => {
                type Svc = typeof db.services.imageCompositor;
                type _Ok = Assert<Equal<Svc, Observe<Thing | null>>>;
                return () => { };
            },
        },
    },
});

type _FromPluginServices = Assert<Equal<
    Database.FromPlugin<typeof servicePlugin>["services"]["imageCompositor"],
    Observe<Thing | null>
>>;
