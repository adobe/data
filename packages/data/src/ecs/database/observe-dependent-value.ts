// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Observe } from "../../observe/index.js";
import { Database } from "./database.js";
import { ReadonlyStore, Store } from "../store/index.js";

/**
 * Creates an observe function that is computed based on the stores resources.
 */
export function observeDependentValue<
    D extends Database<any, any, any, any>,
    T,
>(db: D, compute: (store: D extends Database<infer C, infer R, infer A, any> ? ReadonlyStore<C, R, A> : never) => T): Observe<T> {
    return Observe.withLazy(() => {
        const resourcesUsed = determineResourcesUsed(db, compute);

        // Create observables for only the resources that are actually used
        const resourceObservables = 
            resourcesUsed.map(resource => (db.observe.resources as any)[resource]);
        
        // Use fromArray to combine the resource observables, batch notifications, then map and deduplicate
        return Observe.withDeduplicate(
            Observe.withMap(
                Observe.withBatch(Observe.fromArray(resourceObservables)),
                (_resources) => {
                    return compute(db as any);
                }
            )
        );
    });
}

function determineResourcesUsed<D extends Database<any, any, any, any>>(db: D, compute: (db: D extends Database<infer C, infer R, infer A, any> ? ReadonlyStore<C, R, A> : never) => any): string[] {
    const accessedResources = new Set<string>();
    
    // Create a proxy that tracks which resource properties are accessed
    const resourceProxy = new Proxy(db.resources, {
        get(target, prop) {
            if (typeof prop === 'string') {
                accessedResources.add(prop);
            }
            return (target as any)[prop];
        }
    });
    
    // Create a database object with our proxied resources
    const dbProxy = { ...db, resources: resourceProxy };
    
    // Call the compute function with our proxied database
    // This will track which resources are accessed
    try {
        compute(dbProxy as any);
    } catch (error) {
        // Ignore errors during dependency detection
        // The actual computation will happen later with the real database
    }
    
    return Array.from(accessedResources);
}