// © 2026 Adobe. MIT License. See /LICENSE for details.

import { describe, it, expect } from "vitest";
import { createPlugin } from "./create-plugin.js";
import { Database } from "./database.js";
import { Observe } from "../../observe/index.js";

describe("Database.Plugin.create", () => {
    describe("property order validation", () => {
        it("should throw error if properties are in wrong order", () => {
            expect(() => {
                Database.Plugin.create({
                    components: {},
                    extends: undefined, // extends should come first
                });
            }).toThrow('Property "extends" must come before "components"');

            expect(() => {
                Database.Plugin.create({
                    components: {},
                    services: {}, // services should come before components
                });
            }).toThrow('Property "services" must come before "components"');

            expect(() => {
                Database.Plugin.create({
                    systems: {},
                    actions: {}, // actions should come before systems
                });
            }).toThrow('Property "actions" must come before "systems"');

            expect(() => {
                Database.Plugin.create({
                    transactions: {},
                    archetypes: {}, // archetypes should come before transactions
                });
            }).toThrow('Property "archetypes" must come before "transactions"');

            expect(() => {
                Database.Plugin.create({
                    components: {},
                    resources: {},
                    archetypes: {},
                    transactions: {},
                    computed: {}, // computed should come before transactions
                });
            }).toThrow('Property "computed" must come before "transactions"');
        });

        it("should accept properties in correct order", () => {
            expect(() => {
                Database.Plugin.create({
                    extends: undefined,
                    services: {},
                    components: {},
                    resources: {},
                    archetypes: {},
                    computed: {},
                    transactions: {},
                    actions: {},
                    systems: {},
                });
            }).not.toThrow();

            expect(() => {
                Database.Plugin.create({
                    services: {},
                    components: {},
                    resources: {},
                    archetypes: {},
                    transactions: {},
                    actions: {},
                    systems: {},
                });
            }).not.toThrow();
        });

        it("should create plugin with computed (Observe factories) in correct order", async () => {
            const plugin = createPlugin({
                components: {},
                resources: { n: { default: 10 as number } },
                archetypes: {},
                computed: {
                    value: (_db) => Observe.fromConstant(42),
                    doubleN: (db) => Observe.withMap(db.observe.resources.n, (value) => value * 2),
                },
                transactions: {},
                actions: {},
                systems: {},
            });
            expect(plugin.computed).toBeDefined();
            expect(plugin.computed.value).toBeDefined();
            // computed.value is a factory (db) => Observe<T>, not the Observe itself
            expect(typeof plugin.computed.value).toBe("function");

            const db = Database.create(plugin);
            const value = await Observe.toPromise(db.computed.value);
            expect(value).toBe(42);
            const doubleN = await Observe.toPromise(db.computed.doubleN);
            expect(doubleN).toBe(20);
        });

        it("should create plugin with computed returning functions", async () => {
            const plugin = createPlugin({
                components: {},
                resources: { n: { default: 10 as number } },
                archetypes: {},
                computed: {
                    direct: (_db) => Observe.fromConstant(42),
                    scaled: (db) => (factor: number) =>
                        Observe.withMap(db.observe.resources.n, (value) => value * factor),
                },
                transactions: {},
                actions: {},
                systems: {},
            });

            expect(typeof plugin.computed.direct).toBe("function");
            expect(typeof plugin.computed.scaled).toBe("function");

            const db = Database.create(plugin);

            const directValue = await Observe.toPromise(db.computed.direct);
            expect(directValue).toBe(42);

            const scaledObserve = db.computed.scaled(3);
            const scaledValue = await Observe.toPromise(scaledObserve);
            expect(scaledValue).toBe(30);
        });

        it("should allow actions to access services from the same plugin", () => {
            const authService = { token: 'test', isAuthenticated: true };
            const plugin = Database.Plugin.create({
                services: {
                    auth: () => authService,
                },
                actions: {
                    getAuth: (db) => db.services.auth,
                },
            });

            expect(plugin.services.auth).toBeDefined();
            expect(plugin.actions.getAuth).toBeDefined();
        });
    });

    describe("single descriptor (no dependencies)", () => {
        it("should create plugin with components, resources, and archetypes", () => {
            const plugin = createPlugin({
                components: {
                    velocity: { type: "number" },
                    particle: { type: "boolean" },
                },
                resources: {
                    mousePosition: { default: 0 as number },
                    fooPosition: { default: 0 as number },
                },
                archetypes: {
                    Particle: ["particle"],
                    DynamicParticle: ["particle", "velocity"],
                },
                systems: {
                    updateSystem: {
                        create: (db) => () => {
                            db.store.archetypes.Particle.insert({ particle: true });
                            db.archetypes.Particle.id.toString();
                            // @ts-expect-error - foo does not exist
                            db.archetypes.foo
                        }
                    }
                }
            });
        });


        it("should infer db type correctly with single descriptor", () => {
            const plugin = createPlugin({
                resources: {
                    time: { default: 0 as number },
                },
                systems: {
                    physicsSystem: {
                        create: (db) => () => {
                            const time: number = db.resources.time;
                            // @ts-expect-error - this should be an error
                            const dt: number = db.resources.deltaTime2;
                        }
                    }
                }
            });

            expect(plugin).toBeDefined();
            expect(plugin.systems).toBeDefined();
        });

        it("should constrain archetype references at input", () => {
            createPlugin({
                components: {
                    particle: { type: "boolean" },
                },
                archetypes: {
                    Particle: ["particle"],
                    // @ts-expect-error - DoesNotExist component does not exist
                    DoesNotExist: ["particle234"],
                },
            });
        });

        it("should constrain archetype access in systems", () => {
            createPlugin({
                components: {
                    particle: { type: "boolean" },
                },
                archetypes: {
                    Particle: ["particle"],
                },
                systems: {
                    testSystem: {
                        create: (db) => () => {
                            db.archetypes.Particle; // ✅ OK
                            // @ts-expect-error - foo does not exist
                            db.archetypes.foo;
                        }
                    }
                }
            });
        });

        it("should constrain schedule references to dependency system names", () => {
            const basePlugin = createPlugin({
                systems: {
                    update: {
                        create: (_db) => () => { }
                    },
                    render: {
                        create: (_db) => () => { }
                    }
                }
            });

            const plugin = createPlugin(
                {
                    extends: basePlugin,
                    systems: {
                        renderSystem: {
                            create: (_db) => () => { },
                            schedule: {
                                after: ["update"],
                                // @ts-expect-error - render2 does not exist
                                before: ["render2"]
                            }
                        }
                    },
                },
            );

            expect(plugin).toBeDefined();
            expect(plugin.systems).toBeDefined();
        });
    });

    describe("with dependencies", () => {
        it("should merge components from dependencies", () => {
            const basePlugin = createPlugin({
                components: {
                    position: { type: "number" },
                    health: { type: "number" }
                }
            });

            const extendedPlugin = createPlugin(
                {
                    extends: basePlugin,
                    components: {
                        velocity: { type: "number" }
                    },
                },
            );

            expect("position" in extendedPlugin.components).toBe(true);
            expect("health" in extendedPlugin.components).toBe(true);
            expect("velocity" in extendedPlugin.components).toBe(true);
        });

        it("should merge resources from dependencies", () => {
            const basePlugin = createPlugin({
                resources: {
                    time: { default: 0 },
                    config: { default: "default" }
                }
            });

            const extendedPlugin = createPlugin(
                {
                    extends: basePlugin,
                    resources: {
                        delta: { default: 0 }
                    },
                },
            );

            expect("time" in extendedPlugin.resources).toBe(true);
            expect("config" in extendedPlugin.resources).toBe(true);
            expect("delta" in extendedPlugin.resources).toBe(true);
        });

        it("should merge systems from dependencies", () => {
            const basePlugin = createPlugin({
                systems: {
                    inputSystem: {
                        create: (_db) => () => { }
                    }
                }
            });

            const extendedPlugin = createPlugin(
                {
                    extends: basePlugin,
                    systems: {
                        renderSystem: {
                            create: (_db) => () => { }
                        }
                    },
                },
            );

            expect("inputSystem" in extendedPlugin.systems!).toBe(true);
            expect("renderSystem" in extendedPlugin.systems!).toBe(true);
        });

        it("should allow systems to access dependency resources", () => {
            const basePlugin = createPlugin({
                resources: {
                    time: { default: 0 as number }
                }
            });

            const extendedPlugin = createPlugin(
                {
                    extends: basePlugin,
                    systems: {
                        mySystem: {
                            create: (db) => () => {
                                const time: number = db.resources.time;  // Should work!
                                expect(typeof time).toBe("number");
                            }
                        }
                    },
                },
            );

            expect(extendedPlugin).toBeDefined();
        });

        it("should allow multiple dependencies", () => {
            const plugin1 = createPlugin({
                components: { a: { type: "number" } }
            });

            const plugin2 = createPlugin({
                components: { b: { type: "string" } }
            });

            const plugin3 = createPlugin({
                components: { c: { type: "boolean" } }
            });

            const combinedBase = Database.Plugin.combine(plugin1, plugin2, plugin3);
            const merged = createPlugin(
                {
                    extends: combinedBase,
                    components: { d: { type: "number" } },
                },
            );

            expect("a" in merged.components).toBe(true);
            expect("b" in merged.components).toBe(true);
            expect("c" in merged.components).toBe(true);
            expect("d" in merged.components).toBe(true);
        });
    });

    describe("schedule validation", () => {


        it("should allow referencing dependency systems in schedule", () => {
            const basePlugin = createPlugin({
                systems: {
                    inputSystem: {
                        create: (_db) => () => { }
                    }
                }
            });

            expect(() => {
                createPlugin({
                    extends: basePlugin,
                    systems: {
                        renderSystem: {
                            create: (_db) => () => { },
                            schedule: {
                                after: ["inputSystem"]  // Reference from dependency!
                            }
                        }
                    },
                });
            }).not.toThrow();
        });

        it("should validate across multiple dependencies", () => {
            const plugin1 = createPlugin({
                systems: {
                    system1: {
                        create: (_db) => () => { }
                    }
                }
            });

            const plugin2 = createPlugin({
                systems: {
                    system2: {
                        create: (_db) => () => { }
                    }
                }
            });

            expect(() => {
                createPlugin({
                    extends: Database.Plugin.combine(plugin1, plugin2),
                    systems: {
                        system3: {
                            create: (_db) => () => { },
                            schedule: {
                                after: ["system1", "system2"]  // Both from dependencies
                            }
                        }
                    },
                });
            }).not.toThrow();
        });

        it("should constrain schedule references to dependency system names", () => {
            const basePlugin = createPlugin({
                systems: {
                    inputSystem: {
                        create: (_db) => () => { }
                    },
                    physicsSystem: {
                        create: (_db) => () => { }
                    }
                }
            });

            // ✅ VALID: referencing actual systems from dependencies (no 'as const' needed!)
            const validPlugin = createPlugin({
                extends: basePlugin,
                systems: {
                    renderSystem: {
                        create: (_db) => () => { },
                        schedule: {
                            // TypeScript autocompletes: "inputSystem" | "physicsSystem"
                            after: ["inputSystem", "physicsSystem"]
                        }
                    }
                },
            });

            expect(validPlugin).toBeDefined();
            expect(validPlugin.systems).toHaveProperty("renderSystem");
        });
    });

    describe("type inference edge cases", () => {
        it("should block arbitrary property access on resources", () => {
            const plugin = createPlugin({
                resources: {
                    time: { default: 0 as number }
                },
                systems: {
                    testSystem: {
                        create: (db) => () => {
                            const time: number = db.resources.time;  // OK
                            // @ts-expect-error - should error
                            const invalid: number = db.resources.nonExistent;
                        }
                    }
                }
            });

            expect(plugin).toBeDefined();
        });

        it("should block arbitrary property access with dependencies", () => {
            const basePlugin = createPlugin({
                resources: {
                    time: { default: 0 as number }
                }
            });

            const extendedPlugin = createPlugin({
                extends: basePlugin,
                resources: {
                    delta: { default: 0 as number }
                },
                systems: {
                    testSystem: {
                        create: (db) => () => {
                            const time: number = db.resources.time;    // OK - from dependency
                            const delta: number = db.resources.delta;   // OK - from descriptor
                            // @ts-expect-error - should error
                            const invalid: number = db.resources.nonExistent;
                        }
                    }
                },
            });

            expect(extendedPlugin).toBeDefined();
        });
    });

    describe("identity validation", () => {
        it("should throw error when merging different component definitions", () => {
            const plugin1 = createPlugin({
                components: {
                    health: { type: "number" as const }
                }
            });

            expect(() => {
                createPlugin({
                    extends: plugin1,
                    components: {
                        health: { type: "string" as const } // Different definition
                    },
                });
            }).toThrow('Plugin combine conflict: components.health must be identical (===) across plugins');
        });

        it("should throw error when merging different resource definitions", () => {
            const plugin1 = createPlugin({
                resources: {
                    score: { default: 0 }
                }
            });

            expect(() => {
                createPlugin({
                    extends: plugin1,
                    resources: {
                        score: { default: 100 } // Different definition
                    },
                });
            }).toThrow('Plugin combine conflict: resources.score must be identical (===) across plugins');
        });

        it("should throw error when merging different archetype definitions", () => {
            const plugin1 = createPlugin({
                components: {
                    position: { type: "number" },
                    velocity: { type: "number" }
                },
                archetypes: {
                    Entity: ["position"]
                }
            });

            expect(() => {
                createPlugin({
                    extends: plugin1,
                    archetypes: {
                        Entity: ["position", "velocity"] // Different definition
                    },
                });
            }).toThrow('Plugin combine conflict: archetypes.Entity must be identical (===) across plugins');
        });

        it("should allow same component with identical reference", () => {
            const sharedComponent = { type: "number" as const };
            const plugin1 = createPlugin({
                components: {
                    health: sharedComponent
                }
            });

            expect(() => {
                createPlugin({
                    extends: plugin1,
                    components: {
                        health: sharedComponent // Same reference - OK
                    },
                });
            }).not.toThrow();
        });

        it("should throw error when merging different transaction definitions", () => {
            const plugin1 = createPlugin({
                transactions: {
                    updateEntity: (store: any) => { }
                }
            });

            expect(() => {
                createPlugin({
                    extends: plugin1,
                    transactions: {
                        updateEntity: (store: any) => { } // Different function reference - error
                    },
                });
            }).toThrow('Plugin combine conflict: transactions.updateEntity must be identical (===) across plugins');
        });

        it("should allow same transaction with identical reference", () => {
            const sharedTransaction = (store: any) => { };
            const plugin1 = createPlugin({
                transactions: {
                    updateEntity: sharedTransaction
                }
            });

            expect(() => {
                createPlugin({
                    extends: plugin1,
                    transactions: {
                        updateEntity: sharedTransaction // Same reference - OK
                    },
                });
            }).not.toThrow();
        });

        it("should throw error when merging different system definitions", () => {
            const plugin1 = createPlugin({
                systems: {
                    update: {
                        create: () => () => { }
                    }
                }
            });

            expect(() => {
                createPlugin({
                    extends: plugin1,
                    systems: {
                        update: {
                            create: () => () => { } // Different function - error
                        }
                    },
                });
            }).toThrow('Plugin combine conflict: systems.update must be identical (===) across plugins');
        });

        it("should allow same system with identical reference", () => {
            const sharedSystem = {
                create: () => () => { }
            };
            const plugin1 = createPlugin({
                systems: {
                    update: sharedSystem
                }
            });

            expect(() => {
                createPlugin({
                    extends: plugin1,
                    systems: {
                        update: sharedSystem // Same reference - OK
                    },
                });
            }).not.toThrow();
        });
    });
});

