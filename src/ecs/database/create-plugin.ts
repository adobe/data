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

import type { Database, SystemFunction } from "./database.js";
import type { ComponentSchemas } from "../component-schemas.js";
import type { ResourceSchemas } from "../resource-schemas.js";
import type { ArchetypeComponents } from "../store/archetype-components.js";
import type { TransactionDeclarations, ToTransactionFunctions } from "../store/transaction-functions.js";
import type { ActionDeclarations, ToActionFunctions } from "../store/action-functions.js";
import type { FromSchemas } from "../../schema/index.js";
import type { StringKeyof, Simplify, NoInfer } from "../../types/types.js";
import { combinePlugins } from "./combine-plugins.js";
import { Assert } from "../../types/assert.js";
import { Equal } from "../../types/equal.js";

type RemoveIndex<T> = Simplify<{
    [K in keyof T as
      string extends K ? never :
      number extends K ? never :
      symbol extends K ? never :
      K
    ]: T[K]
  }>;

export function createPlugin<
    const CS extends ComponentSchemas,
    const RS extends ResourceSchemas,
    const A extends ArchetypeComponents<StringKeyof<RemoveIndex<CS> & CSX>>,
    const TD extends TransactionDeclarations<FromSchemas<RemoveIndex<CS> & CSX>, FromSchemas<RemoveIndex<RS> & RSX>, RemoveIndex<A>>,
    const S extends string = never,
    const AD extends ActionDeclarations<FromSchemas<RemoveIndex<CS> & CSX>, FromSchemas<RemoveIndex<RS> & RSX>, RemoveIndex<A>, ToTransactionFunctions<RemoveIndex<TD> & TDX>, S | SX> = {},
    const CSX extends ComponentSchemas = {},
    const RSX extends ResourceSchemas = {},
    const AX extends ArchetypeComponents<StringKeyof<CSX>> = {},
    const TDX extends TransactionDeclarations<FromSchemas<CSX>, FromSchemas<RSX>, AX> = {},
    const SX extends string = never,
    const ADX extends ActionDeclarations<FromSchemas<CSX>, FromSchemas<RSX>, AX, ToTransactionFunctions<TDX>, S | SX> = {},
>(
    plugins: {
        components?: CS,
        resources?: RS,
        archetypes?: A,
        transactions?: TD,
        systems?: { readonly [K in S]: {
            readonly create: (db: Database<
                FromSchemas<RemoveIndex<CS> & CSX>,
                FromSchemas<RemoveIndex<RS> & RSX>,
                RemoveIndex<A> & AX,
                ToTransactionFunctions<RemoveIndex<TD> & TDX>,
                string,
                ToActionFunctions<RemoveIndex<AD> & ADX>
            >) => SystemFunction | void;
            readonly schedule?: {
                readonly before?: readonly NoInfer<Exclude<S | SX, K>>[];
                readonly after?: readonly NoInfer<Exclude<S | SX, K>>[];
                readonly during?: readonly NoInfer<Exclude<S | SX, K>>[];
            }
            }
        }
        actions?: AD
        extends?: Database.Plugin<CSX, RSX, AX, TDX, SX, any>
    },
): Database.Plugin<
    Simplify<RemoveIndex<CS> & CSX>,
    Simplify<RemoveIndex<RS> & RSX>,
    Simplify<RemoveIndex<A> & AX>,
    Simplify<RemoveIndex<TD> & TDX>,
    S | SX,
    Simplify<RemoveIndex<AD> & ADX>
>
{
    // Normalize plugins descriptor to a plugin object
    const plugin: any = {
        components: plugins.components ?? {},
        resources: plugins.resources ?? {},
        archetypes: plugins.archetypes ?? {},
        transactions: plugins.transactions ?? {},
        systems: plugins.systems ?? {},
        actions: plugins.actions ?? {},
    };

    if (plugins.extends) {
        return combinePlugins(plugins.extends, plugin) as any;
    }
    return plugin as any;
}

function compileTimeTypeChecks() {
    // empty plugin
    const emptyPlugin = createPlugin({});
    type CheckEmptyPlugin = Assert<Equal<typeof emptyPlugin, Database.Plugin<{}, {}, {}, {}, never, {}>>>;

    const componentsOnlyPlugin = createPlugin({
        components: {
            a: { type: "number" },
            b: { type: "string" }
        }
    });
    type CheckComponentsOnlyPlugin = Assert<Equal<typeof componentsOnlyPlugin, Database.Plugin<{
        readonly a: {
            readonly type: "number";
        };
        readonly b: {
            readonly type: "string";
        };
    }, {}, {}, {}, never, {}>>>;

    // test invalid archetype component reference
    createPlugin({
        archetypes: {
            // valid archetype component reference to optional component
            Transient: ["transient"],
            // @ts-expect-error - invalid archetype reference
            InvalidArchetype: ["bar"],
        }
    });

    // test valid and invalid transactions and systems
    createPlugin({
        components: {
            a: { type: "number" },
            b: { type: "string" }
        },
        resources: {
            c: { default: false as boolean }
        },
        archetypes: {
            A: ["a", "b"],
            ABTransient: ["a", "b", "transient"],
        },
        transactions: {
            testChanges: (store) => {
                // valid resource assignment
                store.resources.c = true;
                // @ts-expect-error - invalid resource assignment
                store.resources.d = true;
                // @ts-expect-error - invalid archetype reference
                store.archetypes.foo
                // valid archetype 
                store.archetypes.A.insert({ a: 1, b: "2" });
                // valid update
                store.update(0, { a: 2 });
                // @ts-expect-error - invalid update
                store.update(0, { d: 10 });
            }
        },
        systems: {
            update: {
                create: (db) => () => {}
            },
            render: {
                create: (db) => () => {},
                schedule: {
                    after: ["update"],
                    // @ts-expect-error - render would be a self-reference
                    before: ["render"],
                    // @ts-expect-error - invalid system reference
                    during: ["invalid"]
                }
            }
        }
    });

    const basePlugin = createPlugin({
        components: {
            alpha: { type: "number" },
            beta: { type: "string" }
        },
        resources: {
            charlie: { default: false as boolean }
        },
        archetypes: {
            Foo: ["alpha", "beta"],
            FooTransient: ["alpha", "beta", "transient"],
        },
        transactions: {
            doAlpha: (store, input: { a: number, b: string }) => {},
            doBeta: (store, input: { c: number }) => {}
        },
        systems: {
            input: {
                create: (db) => () => {}
            },
            output: {
                create: (db) => () => {}
            }
        }
    });

    // test valid and invalid transactions and systems that use an extended plugin.
    const extendedPlugin = createPlugin({
        components: {
            a: { type: "number" },
            b: { type: "string" }
        },
        resources: {
            c: { default: false as boolean }
        },
        archetypes: {
            // test referencing components from the base plugin
            A: ["a", "b", "alpha", "beta"],
            ABTransient: ["a", "b", "alpha", "beta", "transient"],
        },
        transactions: {
            testChanges: (store) => {
                // assign to resource from the base plugin
                store.resources.charlie = true;
                // assignt to resources from this plugin
                store.resources.c = true;
                // @ts-expect-error - invalid resource assignment
                store.resources.delta = true;
                // @ts-expect-error - invalid archetype reference
                store.archetypes.foo
                // valid archetype 
                store.archetypes.A.insert({ a: 1, b: "2", alpha: 3, beta: "4" });
                // valid update using base components
                store.update(0, { a: 2, alpha: 3 });
            }
        },
        systems: {
            update: {
                create: (db) => () => {},
                schedule: {
                    // test referencing systems from the base plugin
                    after: ["input"],
                    before: ["output"],
                    during: ["render"],
                }
            },
            render: {
                create: (db) => () => {},
                schedule: {
                    after: ["update"],
                    // @ts-expect-error - render would be a self-reference
                    before: ["render"],
                    // @ts-expect-error - invalid system reference
                    during: ["invalid"]
                }
            }
        },
        extends: basePlugin
    });

}