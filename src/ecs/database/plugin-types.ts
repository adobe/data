// import { Assert, Equal, Simplify, StringKeyof } from "../../types/index.js";
// import { ActionDeclarations, ResourceSchemas, ArchetypeComponents, ComponentSchemas, FromSchemas, ToActionFunctions, Store, Entity } from "../index.js";
// import type { Database, SystemFunction } from "./database.js";

// type RemoveIndex<T> = Simplify<{
//     [K in keyof T as
//       string extends K ? never :
//       number extends K ? never :
//       symbol extends K ? never :
//       K
//     ]: T[K]
//   }>;
// type CheckT2 = Assert<Equal<RemoveIndex<{ a: 1 }>, { a: 1 }>>;
// type CheckT3 = Assert<Equal<RemoveIndex<{ [key: string]: number }>, {}>>;

// function createPlugin<
//     const CS extends ComponentSchemas,
//     const RS extends ResourceSchemas,
//     const A extends ArchetypeComponents<StringKeyof<RemoveIndex<CS> & CSX>>,
//     const TD extends ActionDeclarations<FromSchemas<RemoveIndex<CS> & CSX>, FromSchemas<RemoveIndex<RS> & RSX>, RemoveIndex<A>>,
//     const S extends string = never,
//     const CSX extends ComponentSchemas = {},
//     const RSX extends ResourceSchemas = {},
//     const AX extends ArchetypeComponents<StringKeyof<CSX>> = {},
//     const TDX extends ActionDeclarations<FromSchemas<CSX>, FromSchemas<RSX>, AX> = {},
//     const SX extends string = never,
// >(
//     plugins: {
//         components?: CS,
//         resources?: RS,
//         archetypes?: A,
//         transactions?: TD,
//         systems?: { readonly [K in S]: {
//             readonly create: (db: Database<
//                 FromSchemas<RemoveIndex<CS> & CSX>,
//                 FromSchemas<RemoveIndex<RS> & RSX>,
//                 RemoveIndex<A> & AX,
//                 ToActionFunctions<RemoveIndex<TD> & TDX>,
//                 string
//             >) => SystemFunction;
//             readonly schedule?: {
//                 readonly before?: readonly NoInfer<Exclude<S | SX, K>>[];
//                 readonly after?: readonly NoInfer<Exclude<S | SX, K>>[];
//                 readonly during?: readonly NoInfer<Exclude<S | SX, K>>[];
//             }
//             }
//         }
//     },
//     extend?: Database.Plugin<CSX, RSX, AX, TDX, SX>
// ): Database.Plugin<
//     Simplify<RemoveIndex<CS> & CSX>,
//     Simplify<RemoveIndex<RS> & RSX>,
//     Simplify<RemoveIndex<A> & AX>,
//     Simplify<RemoveIndex<TD> & TDX>, S | SX>
// {
//     return null as any;
// }

// // empty plugin
// const emptyPlugin = createPlugin({});
// type CheckEmptyPlugin = Assert<Equal<typeof emptyPlugin, Database.Plugin<{}, {}, {}, {}, never>>>;

// const componentsOnlyPlugin = createPlugin({
//     components: {
//         a: { type: "number" },
//         b: { type: "string" }
//     }
// });
// type CheckComponentsOnlyPlugin = Assert<Equal<typeof componentsOnlyPlugin, Database.Plugin<{
//     readonly a: {
//         readonly type: "number";
//     };
//     readonly b: {
//         readonly type: "string";
//     };
// }, {}, {}, {}, never>>>;

// // test invalid archetype component reference
// createPlugin({
//     resources: {},
//     archetypes: {
//         // valid archetype component reference to optional component
//         Transient: ["transient"],
//         // @ts-expect-error - invalid archetype reference
//         InvalidArchetype: ["bar"],
//     },
//     transactions: {}, systems: {}
// });

// // test valid and invalid transactions and systems
// createPlugin({
//     components: {
//         a: { type: "number" },
//         b: { type: "string" }
//     },
//     resources: {
//         c: { default: false as boolean }
//     },
//     archetypes: {
//         A: ["a", "b"],
//         ABTransient: ["a", "b", "transient"],
//     },
//     transactions: {
//         testChanges: (store) => {
//             // valid resource assignment
//             store.resources.c = true;
//             // @ts-expect-error - invalid resource assignment
//             store.resources.d = true;
//             // @ts-expect-error - invalid archetype reference
//             store.archetypes.foo
//             // valid archetype 
//             store.archetypes.A.insert({ a: 1, b: "2" });
//             // valid update
//             store.update(0, { a: 2 });
//             // @ts-expect-error - invalid update
//             store.update(0, { d: 10 });
//         }
//     },
//     systems: {
//         update: {
//             create: (db) => () => {}
//         },
//         render: {
//             create: (db) => () => {},
//             schedule: {
//                 after: ["update"],
//                 // @ts-expect-error - render would be a self-reference
//                 before: ["render"],
//                 // @ts-expect-error - invalid system reference
//                 during: ["invalid"]
//             }
//         }
//     }
// });

// const basePlugin = createPlugin({
//     components: {
//         alpha: { type: "number" },
//         beta: { type: "string" }
//     },
//     resources: {
//         charlie: { default: false as boolean }
//     },
//     archetypes: {
//         Foo: ["alpha", "beta"],
//         FooTransient: ["alpha", "beta", "transient"],
//     },
//     transactions: {
//         doAlpha: (store, input: { a: number, b: string }) => {},
//         doBeta: (store, input: { c: number }) => {}
//     },
//     systems: {
//         input: {
//             create: (db) => () => {}
//         },
//         output: {
//             create: (db) => () => {}
//         }
//     }
// });

// // test valid and invalid transactions and systems that use an extended plugin.
// const extendedPlugin = createPlugin({
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
//             store.resources.charlie = true;
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
//             create: (db) => () => {},
//             schedule: {
//                 // test referencing systems from the base plugin
//                 after: ["input"],
//                 before: ["output"],
//                 during: ["render"],
//             }
//         },
//         render: {
//             create: (db) => () => {},
//             schedule: {
//                 after: ["update"],
//                 // @ts-expect-error - render would be a self-reference
//                 before: ["render"],
//                 // @ts-expect-error - invalid system reference
//                 during: ["invalid"]
//             }
//         }
//     }
// }, basePlugin);
