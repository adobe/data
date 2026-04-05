// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Compile-time type checks for create API.

import { Observe } from "../../observe/index.js";
import {
    create,
    type ImplementationFromDeclarations,
} from "./create.js";
import type { Action as AgenticAction } from "./action.js";
import type { Assert } from "../../types/assert.js";
import type { Equal } from "../../types/equal.js";

type _StateTypeCheck = Assert<Equal<
    ImplementationFromDeclarations<{
        health: { type: "state"; schema: { type: "number" }; description: "Health" };
    }>["health"],
    Observe<number>
>>;

type _ActionTypeCheck = Assert<Equal<
    ImplementationFromDeclarations<{
        heal: {
            type: "action";
            description: "Heal";
            parameters: [{ type: "number" }];
        };
    }>["heal"],
    (input: number) => Promise<void | import("../../data.js").Data> | import("../../data.js").Data | void
>>;

type _MultipleActionsTypeCheck = Assert<Equal<
    ImplementationFromDeclarations<{
        heal: {
            type: "action";
            description: "Heal";
            parameters: [{ type: "number" }];
        };
        rename: {
            type: "action";
            description: "Rename";
            parameters: [{ type: "string" }];
        };
    }>,
    {
        heal: (input: number) => Promise<void | import("../../data.js").Data> | import("../../data.js").Data | void;
        rename: (input: string) => Promise<void | import("../../data.js").Data> | import("../../data.js").Data | void;
    }
>>;

type _MultiParamImplementationTypeCheck = Assert<Equal<
    ImplementationFromDeclarations<{
        multi: {
            type: "action";
            description: "Multi";
            parameters: [
                { type: "number" },
                { type: "string" },
            ];
        };
    }>["multi"],
    (...input: [number, string]) => Promise<void | import("../../data.js").Data> | import("../../data.js").Data | void
>>;

type _MultiParamActionTypeCheck = Equal<
    AgenticAction<[
        { type: "number" },
        { type: "string" },
    ]>,
    {
        description: string;
        parameters: [
            { type: "number" },
            { type: "string" },
        ];
        execute: (...input: [number, string]) => Promise<void | import("../../data.js").Data> | import("../../data.js").Data | void;
    }
>;

const iface = {
    health: {
        type: "state",
        schema: { type: "number" },
        description: "Current health points",
    },
    stats: {
        type: "state",
        schema: {
            type: "object",
            properties: {
                hp: { type: "number" },
                label: { type: "string" },
            },
            required: ["hp"],
            additionalProperties: false,
        },
        description: "Current player stats",
    },
    heal: {
        type: "action",
        description: "Increase health by amount",
        parameters: [{ type: "number" }],
    },
    configure: {
        type: "action",
        description: "Configure stats",
        parameters: [
            {
                title: "values",
                type: "object",
                properties: {
                    hp: { type: "number" },
                    label: { type: "string" },
                },
                required: ["hp"],
                additionalProperties: false,
            },
        ],
    },
    reset: {
        type: "action",
        description: "Reset values",
        parameters: [],
    },
} as const;

const multiIface = {
    multi: {
        type: "action",
        description: "Multi",
        parameters: [
            { type: "number" },
            { type: "string" },
        ],
    },
} as const;

create({
    interface: iface,
    implementation: {
        health: Observe.fromConstant(42),
        stats: Observe.fromConstant({ hp: 100, label: "ok" }),
        heal: (input: number) => {
            type _Check = Assert<Equal<typeof input, number>>;
        },
        configure: (input: { readonly hp: number; readonly label?: string }) => {
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
    interface: multiIface,
    implementation: {
        multi: (a: number, b: string) => {},
    },
});

create({
    interface: multiIface,
    implementation: {
        // @ts-expect-error - multi parameters must be [number, string]
        multi: (a: string, b: string) => {},
    },
});

create({
    interface: iface,
    implementation: {
        // @ts-expect-error - health state requires Observe<number>
        health: Observe.fromConstant("wrong"),
        stats: Observe.fromConstant({ hp: 100 }),
        heal: () => {},
        configure: () => {},
        reset: () => {},
    },
});

create({
    interface: iface,
    implementation: {
        health: Observe.fromConstant(100),
        stats: Observe.fromConstant({ hp: 100 }),
        // @ts-expect-error - heal input schema requires number
        heal: (input: string) => {},
        configure: () => {},
        reset: () => {},
    },
});

create({
    interface: iface,
    implementation: {
        health: Observe.fromConstant(100),
        stats: Observe.fromConstant({ hp: 100 }),
        heal: () => {},
        configure: () => {},
        reset: () => {},
    },
});

create({
    interface: iface,
    // @ts-expect-error - implementation must include every definition key
    implementation: {
        health: Observe.fromConstant(100),
        stats: Observe.fromConstant({ hp: 100 }),
        heal: () => {},
        configure: () => {},
    },
});

create({
    interface: iface,
    implementation: {
        health: Observe.fromConstant(100),
        stats: Observe.fromConstant({ hp: 100 }),
        heal: () => {},
        configure: () => {},
        reset: () => {},
    },
    conditional: {
        health: Observe.fromConstant(true),
        // @ts-expect-error - conditional values must be Observe<boolean>
        heal: Observe.fromConstant(1),
    },
});

// Links: declared in interface, supplied in implementation
const linkTarget = create({
    interface: {},
    implementation: {},
});
create({
    interface: { other: { type: "link", description: "Other service" } },
    implementation: { other: linkTarget },
});
create({
    interface: { other: { type: "link" } },
    implementation: { other: Observe.fromConstant(linkTarget) },
});
