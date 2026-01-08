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

import { Database, SystemFunction } from "./database.js";
import type { ComponentSchemas } from "../component-schemas.js";
import type { ResourceSchemas } from "../resource-schemas.js";
import type { ArchetypeComponents } from "../store/archetype-components.js";
import type { TransactionDeclarations, ToTransactionFunctions } from "../store/transaction-functions.js";
import type { ActionDeclarations, ToActionFunctions } from "../store/action-functions.js";
import type { FromSchemas } from "../../schema/index.js";
import type { StringKeyof, Simplify, NoInfer } from "../../types/types.js";
import { CombinePlugins, combinePlugins } from "./combine-plugins.js";
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
    const XP extends Database.Plugin<{},{},{},{},never,{}>,
    const CS extends ComponentSchemas,
    const RS extends ResourceSchemas,
    const A extends ArchetypeComponents<StringKeyof<RemoveIndex<CS> & XP['components']>>,
    const TD extends TransactionDeclarations<FromSchemas<RemoveIndex<CS> & XP['components']>, FromSchemas<RemoveIndex<RS> & XP['resources']>, RemoveIndex<A> & XP['archetypes']>,
    const AD,
    const S extends string = never,

>(
    plugins: {
        components?: CS,
        resources?: RS,
        archetypes?: A,
        transactions?: TD,
        actions?: AD & { readonly [K: string]: (db: Database<
            FromSchemas<RemoveIndex<CS> & XP['components']>,
            FromSchemas<RemoveIndex<RS> & XP['resources']>,
            RemoveIndex<A> & XP['archetypes'],
            ToTransactionFunctions<RemoveIndex<TD> & XP['transactions']>,
            string,
            ToActionFunctions<XP['actions']>
        >, input?: any) => any }
        systems?: { readonly [K in S]: {
            readonly create: (db: Database<
                FromSchemas<RemoveIndex<CS> & XP['components']>,
                FromSchemas<RemoveIndex<RS> & XP['resources']>,
                RemoveIndex<A> & XP['archetypes'],
                ToTransactionFunctions<RemoveIndex<TD> & XP['transactions']>,
                string,
                ToActionFunctions<RemoveIndex<AD> & XP['actions']>
            >) => SystemFunction | void;
            readonly schedule?: {
                readonly before?: readonly NoInfer<Exclude<S | StringKeyof<XP['systems']>, K>>[];
                readonly after?: readonly NoInfer<Exclude<S | StringKeyof<XP['systems']>, K>>[];
                readonly during?: readonly NoInfer<Exclude<S | StringKeyof<XP['systems']>, K>>[];
            }
            }
        },
        extends?: XP
    },
): CombinePlugins<[XP, Database.Plugin<
    RemoveIndex<CS>,
    RemoveIndex<RS>,
    RemoveIndex<A>,
    RemoveIndex<TD>,
    S,
    AD & ActionDeclarations<FromSchemas<RemoveIndex<CS>>, FromSchemas<RemoveIndex<RS>>, RemoveIndex<A>, ToTransactionFunctions<RemoveIndex<TD>>, S>>
]>
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
}function compileTimeTypeChecks() {
    // empty plugin
    const emptyPlugin = createPlugin({});
    // type CheckEmptyPlugin = Assert<Equal<typeof emptyPlugin, Database.Plugin<{}, {}, {}, {}, never, {}>>>;

    const componentsOnlyPlugin = createPlugin({
        components: {
            a: { type: "number" },
            b: { type: "string" }
        }
    });
    // type CheckComponentsOnlyPlugin = Assert<Equal<typeof componentsOnlyPlugin, Database.Plugin<{
    //     readonly a: {
    //         readonly type: "number";
    //     };
    //     readonly b: {
    //         readonly type: "string";
    //     };
    // }, {}, {}, {}, never, {}>>>;

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
                create: (db) => () => {
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
            doBeta: (store) => {}
        },
        actions: {
            doAction: (db) => {
                db.transactions.doAlpha({ a: 1, b: "2" });
                db.transactions.doBeta();
            },
            doOtherAction: (db) => {
            }
        },
        systems: {
            input: {
                create: (db) => () => {
                    db.transactions.doAlpha({ a: 1, b: "2" });
                    db.transactions.doBeta();
                }
            },
            output: {
                create: (db) => () => {
                    db.actions.doAction();
                    db.actions.doOtherAction();
                }
            }
        },
    });
    type ActionsType = typeof basePlugin extends Database.Plugin<any, any, any, any, any, infer A> ? A : never;

    // TODO: Add proper tests for constrained types.
    // Document that the order of your properties matters.

    const extendedPlugin = createPlugin({
        components: {
            a: { type: "number" },
            b: { type: "string" },
        },
        resources: {
            c: { default: false as boolean }
        },
        archetypes: {
            A: ["a", "b", "alpha", "beta"],
            ABTransient: ["a", "b", "alpha", "beta", "transient"],
        },
        transactions: {
            testChanges: (store) => {
                // assign to resource from the base plugin
                // store.resources.charlie = true;
                // assignt to resources from this plugin
                store.resources.c = true;
                type CheckResources = Assert<Equal<typeof store.resources, {
                    c: boolean;
                    charlie: boolean;
                }>>;
                // valid archetype 
                store.archetypes.A.insert({ a: 1, b: "2", alpha: 3, beta: "4" });
                // valid update using base components
                store.update(0, { a: 2, alpha: 3 });
            }
        },
        systems: {
            update: {
                create: (db) => () => {
                    db.transactions.doAlpha({ a: 1, b: "2" });
                    db.transactions.doBeta();
                    db.transactions.testChanges();
                },
                schedule: {},
            },
            render: {
                create: (db) => () => {
                    db.transactions.testChanges();
                },
                schedule: {},
            }
        },
        actions: {
            doExtendedAction: (db) => {
                db.transactions.doAlpha({ a: 1, b: "2" });
                db.transactions.doBeta();
                db.transactions.testChanges();
            },
            doOtherExtendedAction: (db) => {
            }
        },
        extends: basePlugin
    });


    // // test valid and invalid transactions and systems that use an extended plugin.
    // const notWorkingExtendedPlugin = createPlugin({
    //     components: {
    //         a: { type: "number" },
    //         b: { type: "string" }
    //     },
    //     resources: {
    //         c: { default: false as boolean }
    //     },
    //     archetypes: {
    //         // test referencing components from the base plugin
    //         A: ["a", "b", "alpha", "beta"],
    //         ABTransient: ["a", "b", "alpha", "beta", "transient"],
    //     },
    //     transactions: {
    //         testChanges: (store) => {
    //             // assign to resource from the base plugin
    //             // store.resources.charlie = true;
    //             // assignt to resources from this plugin
    //             store.resources.c = true;
    //             // @ts-expect-error - invalid resource assignment
    //             store.resources.delta = true;
    //             // @ts-expect-error - invalid archetype reference
    //             store.archetypes.foo
    //             // valid archetype 
    //             store.archetypes.A.insert({ a: 1, b: "2", alpha: 3, beta: "4" });
    //             // valid update using base components
    //             store.update(0, { a: 2, alpha: 3 });
    //         }
    //     },
    //     systems: {
    //         update: {
    //             create: (db) => () => {
    //                 // db.transactions.doAlpha({ a: 1, b: "2" });
    //             },
    //             schedule: {
    //                 // test referencing systems from the base plugin
    //                 after: ["input"],
    //                 before: ["output"],
    //                 during: ["render"],
    //             }
    //         },
    //         render: {
    //             create: (db) => () => {
    //                 // db.transactions.doAlpha({ a: 1, b: "2" });
    //                 // @ts- expect-error - invalid input
    //                 // db.transactions.doesNotExist({ c: 3 });

    //                 // should be able to use own definition 
    //                 db.transactions.testChanges();
    //             },
    //             schedule: {
    //                 after: ["update"],
    //                 // @ts-expect-error - render would be a self-reference
    //                 before: ["render"],
    //                 // @ts-expect-error - invalid system reference
    //                 during: ["invalid"]
    //             }
    //         }
    //     },
    //     extends: basePlugin
    // });

}

