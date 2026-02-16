// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Compile-time type checks for createFromConfig API.

import { Observe } from "../../observe/index.js";
import {
    create,
    type ImplementationFromDeclarations,
} from "./create.js";
import type { Assert } from "../../types/assert.js";
import type { Equal } from "../../types/equal.js";

type _StateTypeCheck = Assert<Equal<
    ImplementationFromDeclarations<{
        health: { type: "number"; description: "Health" };
    }>["health"],
    Observe<number>
>>;

type _ActionTypeCheck = Assert<Equal<
    ImplementationFromDeclarations<{
        heal: { description: "Heal"; input: { type: "number" } };
    }>["heal"],
    (input: number) => Promise<void | string> | void
>>;

type _VoidActionTypeCheck = Assert<Equal<
    ImplementationFromDeclarations<{
        reset: { description: "Reset" };
    }>["reset"],
    () => Promise<void | string> | void
>>;

const iface = {
    health: {
        type: "number",
        description: "Current health points",
    },
    stats: {
        type: "object",
        description: "Current player stats",
        properties: {
            hp: { type: "number" },
            label: { type: "string" },
        },
        required: ["hp"],
        additionalProperties: false,
    },
    heal: {
        description: "Increase health by amount",
        input: { type: "number" },
    },
    configure: {
        description: "Configure stats",
        input: {
            type: "object",
            properties: {
                hp: { type: "number" },
                label: { type: "string" },
            },
            required: ["hp"],
            additionalProperties: false,
        },
    },
    reset: {
        description: "Reset values",
    },
} as const;

create({
    description: "Player health and actions for agentic access",
    declaration: iface,
    implementation: {
        health: Observe.fromConstant(42),
        stats: Observe.fromConstant({ hp: 100, label: "ok" }),
        heal: (input) => {
            type _Check = Assert<Equal<typeof input, number>>;
        },
        configure: (input) => {
            type _Check = Assert<Equal<typeof input, { readonly hp: number; readonly label?: string }>>;
        },
        reset: () => {},
    },
    conditional: {
        health: Observe.fromConstant(true),
        heal: Observe.fromConstant(false),
    },
});

create({
    description: "Player health and actions for agentic access",
    declaration: iface,
    implementation: {
        // @ts-expect-error - health state requires Observe<number>
        health: Observe.fromConstant("wrong"),
        stats: Observe.fromConstant({ hp: 100 }),
        heal: (input) => {},
        configure: (input) => {},
        reset: () => {},
    },
});

create({
    description: "Player health and actions for agentic access",
    declaration: iface,
    implementation: {
        health: Observe.fromConstant(100),
        stats: Observe.fromConstant({ hp: 100 }),
        // @ts-expect-error - heal input schema requires number
        heal: (input: string) => {},
        configure: (input) => {},
        reset: () => {},
    },
});

create({
    description: "Player health and actions for agentic access",
    declaration: iface,
    implementation: {
        health: Observe.fromConstant(100),
        stats: Observe.fromConstant({ hp: 100 }),
        heal: (input) => {},
        configure: (input) => {},
        // @ts-expect-error - reset action has no input schema
        reset: (input: number) => {},
    },
});

create({
    description: "Player health and actions for agentic access",
    declaration: iface,
    // @ts-expect-error - implementation must include every definition key
    implementation: {
        health: Observe.fromConstant(100),
        stats: Observe.fromConstant({ hp: 100 }),
        heal: (input) => {},
        configure: (input) => {},
    },
});

create({
    description: "Player health and actions for agentic access",
    declaration: iface,
    implementation: {
        health: Observe.fromConstant(100),
        stats: Observe.fromConstant({ hp: 100 }),
        heal: (input) => {},
        configure: (input) => {},
        reset: () => {},
    },
    conditional: {
        health: Observe.fromConstant(true),
        // @ts-expect-error - conditional values must be Observe<boolean>
        heal: Observe.fromConstant(1),
    },
});
