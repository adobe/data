// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Data } from "@adobe/data";
import { Observe } from "@adobe/data/observe";
import type { Schema } from "@adobe/data/schema";
import { AsyncDataService, type Service } from "@adobe/data/service";
import type { CallerContext } from "./caller-context.js";
import { makeObserve } from "./make-observe.js";
import { makePromise } from "./make-promise.js";
import { makeGenerator } from "./make-generator.js";
import { makeVoid } from "./make-void.js";

/**
 * Recursively shim a service's members from its schema. Each described member is
 * either a LEAF (`observe`/`function`, classified with the same `memberKind` the
 * local lazy wrapper uses and wrapped to forward over the transport) or a NESTED
 * service (a child `object` schema with its own `properties`), which is shimmed
 * as a matching nested object. Every leaf is addressed by its full `path` from
 * the service root, so nested members round-trip exactly like top-level ones.
 */
function buildMembers(
    ctx: CallerContext,
    service: string,
    properties: { readonly [key: string]: Schema },
    path: readonly string[],
): Record<string, unknown> {
    const out: Record<string, unknown> = {};
    for (const [key, member] of Object.entries(properties)) {
        const memberPath = [...path, key];
        if (member.type === "observe" || member.type === "function") {
            const kind = AsyncDataService.memberKind(member);
            switch (kind) {
                case "observe":
                    out[key] = makeObserve(ctx, service, memberPath, []);
                    break;
                case "fn:observe":
                    out[key] = (...args: Data[]) => makeObserve(ctx, service, memberPath, args);
                    break;
                case "fn:promise":
                    out[key] = (...args: Data[]) => makePromise(ctx, service, memberPath, args);
                    break;
                case "fn:generator":
                    out[key] = (...args: Data[]) => makeGenerator(ctx, service, memberPath, args);
                    break;
                case "fn:void":
                    out[key] = (...args: Data[]) => makeVoid(ctx, service, memberPath, args);
                    break;
            }
        } else if (member.type === "object" || member.properties !== undefined) {
            // Nested service — shim its members recursively under the extended path.
            out[key] = buildMembers(ctx, service, member.properties ?? {}, memberPath);
        } else {
            // Not a leaf and not a container — let memberKind raise the precise error.
            AsyncDataService.memberKind(member);
        }
    }
    return out;
}

/**
 * Builds an equivalent-shaped local service from a peer service's schema. The
 * `schema` slot republishes the schema as a constant observable, so the projected
 * service is introspectable exactly like any other. Nested services are shimmed
 * on both sides so their members are reachable transparently.
 */
export function synthesizeService(ctx: CallerContext, name: string, schema: Schema): Service {
    const service: Record<string, unknown> = {
        serviceName: `rpc:${name}`,
        schema: Observe.fromConstant(schema),
        ...buildMembers(ctx, name, schema.properties ?? {}, []),
    };
    return service as Service;
}
