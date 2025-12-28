/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

import type { Database } from "./database.js";
import type { ComponentSchemas } from "../component-schemas.js";
import type { ResourceSchemas } from "../resource-schemas.js";
import type { ArchetypeComponents } from "../store/archetype-components.js";
import type { ActionDeclarations, ToActionFunctions } from "../store/action-functions.js";
import type { FromSchemas } from "../../schema/index.js";
import type { StringKeyof, IntersectTuple } from "../../types/types.js";
import type { OptionalComponents } from "../optional-components.js";

type SystemFunction = () => void | Promise<void>;

// Helper type to remove index signatures and keep only known keys
type RemoveIndexSignature<T> = {
    [K in keyof T as string extends K ? never : number extends K ? never : symbol extends K ? never : K]: T[K]
};

type SystemDeclarations = { readonly [K in string]: {
    readonly create: (db: Database<any, any, any, any, any>) => SystemFunction;
    readonly schedule?: { readonly before?: readonly string[]; readonly after?: readonly string[]; readonly during?: readonly string[] };
} };

type PluginSchema<
    CS extends ComponentSchemas = {},
    RS extends ResourceSchemas = {},
    A extends ArchetypeComponents<any> = {},
    TD extends ActionDeclarations<any, any, any> = {},
    SYS extends SystemDeclarations = {}
> = {
    components?: CS;
    resources?: RS;
    archetypes?: A;
    transactions?: TD;
    systems?: SYS;
};

// Helper to extract system names from a plugin
type ExtractSystemNames<P> = P extends Database.Plugin<any, any, any, any, infer S> ? S : never;

// Helper type: Database for plugin creation with schema-based archetypes
type PluginDatabase<
    CS extends ComponentSchemas,
    RS extends ResourceSchemas,
    A extends ArchetypeComponents<StringKeyof<CS>>,
    TD extends ActionDeclarations<any, any, any>,
    S extends string
> = Database<
    FromSchemas<RemoveIndexSignature<CS>>,
    FromSchemas<RemoveIndexSignature<RS>>,
    RemoveIndexSignature<{
        readonly [K in keyof A as string extends K ? never : K]: A[K]
    } & ArchetypeComponents<StringKeyof<FromSchemas<RemoveIndexSignature<CS>>>>>,
    ToActionFunctions<TD>,
    S
>;

// Helper to merge dependency plugins
type MergeDependencies<D extends readonly Database.Plugin<any, any, any, any, any>[]> = {
    components: {} & IntersectTuple<{ [K in keyof D]: D[K] extends Database.Plugin<infer C, any, any, any, any> ? (C extends undefined ? {} : C) : never }>;
    resources: {} & IntersectTuple<{ [K in keyof D]: D[K] extends Database.Plugin<any, infer R, any, any, any> ? (R extends undefined ? {} : R) : never }>;
    archetypes: {} & IntersectTuple<{ [K in keyof D]: D[K] extends Database.Plugin<any, any, infer A, any, any> ? (A extends undefined ? {} : A) : never }>;
    transactions: {} & IntersectTuple<{ [K in keyof D]: D[K] extends Database.Plugin<any, any, any, infer TD, any> ? (TD extends undefined ? Record<never, never> : TD) : never }>;
    systemNames: Extract<{ [K in keyof D]: ExtractSystemNames<D[K]> }[number], string>;
};

// Overload for no dependencies
export function createPlugin<
    const CS extends ComponentSchemas,
    const RS extends ResourceSchemas,
    const A extends ArchetypeComponents<StringKeyof<CS>>,
    const TD extends ActionDeclarations<any, any, any>,
    const SYS extends { readonly [K in string]: {
        readonly create: (db: PluginDatabase<CS, RS, A, TD, string>) => SystemFunction;
        readonly schedule?: {
            readonly before?: readonly Extract<keyof SYS, string>[];
            readonly after?: readonly Extract<keyof SYS, string>[];
            readonly during?: readonly Extract<keyof SYS, string>[];
        };
    } }
>(
    descriptor: {
        components?: CS;
        resources?: RS;
        archetypes?: A;
        transactions?: TD;
        systems?: SYS;
    }
): 
    Database.Plugin<
        CS,
        RS,
        A,
        TD,
        StringKeyof<SYS>
    >
;

// Overload for with dependencies
export function createPlugin<
    const D extends readonly any[],
    const CS extends ComponentSchemas,
    const RS extends ResourceSchemas,
    const A extends ArchetypeComponents<StringKeyof<CS & MergeDependencies<D>['components']>>,
    const TD extends ActionDeclarations<any, any, any>,
    const SYS extends { readonly [K in string]: {
        readonly create: (db: PluginDatabase<
            CS & MergeDependencies<D>['components'],
            RS & MergeDependencies<D>['resources'],
            A,
            TD & MergeDependencies<D>['transactions'],
            MergeDependencies<D>['systemNames'] | string
        >) => SystemFunction;
        readonly schedule?: {
            readonly before?: readonly MergeDependencies<D>['systemNames'][];
            readonly after?: readonly MergeDependencies<D>['systemNames'][];
            readonly during?: readonly MergeDependencies<D>['systemNames'][];
        };
    } },
>(
    descriptor: {
        components?: CS;
        resources?: RS;
        archetypes?: A;
        transactions?: TD;
        systems?: SYS;
    },
    dependencies: D
): Database.Plugin.Intersect<[
    ...D,
    Database.Plugin<CS & MergeDependencies<D>['components'], RS, A, TD, StringKeyof<SYS>>
]>;

// Implementation
export function createPlugin(
    descriptor: any,
    dependencies?: any
): any {
    const requireIdentity = new Set(['components', 'resources', 'archetypes']);
    
    const merge = (base: any, next: any) => 
        Object.fromEntries(keys.map(key => {
            const baseObj = base[key] ?? {};
            const nextObj = next[key] ?? {};
            
            if (requireIdentity.has(key)) {
                const merged = { ...baseObj };
                for (const [k, v] of Object.entries(nextObj)) {
                    if (k in baseObj && baseObj[k] !== v) {
                        throw new Error(
                            `Plugin merge conflict: ${key}.${k} must be identical (===) across plugins`
                        );
                    }
                    merged[k] = v;
                }
                return [key, merged];
            }
            
            return [key, { ...baseObj, ...nextObj }];
        }));
    
    // Merge dependencies first
    const mergedDeps = (dependencies ?? []).reduce(merge, emptyPlugin);
    
    // Merge descriptor on top of dependencies
    return merge(mergedDeps, descriptor);
}
const keys = ['components', 'resources', 'archetypes', 'transactions', 'systems'] as const;
const emptyPlugin: PluginSchema = { components: {}, resources: {}, archetypes: {}, transactions: {}, systems: {} };

