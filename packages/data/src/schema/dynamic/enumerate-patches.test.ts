// © 2026 Adobe. MIT License. See /LICENSE for details.
import { describe, it, expect } from 'vitest';
import { enumeratePatches } from './enumerate-patches.js';
import { Schema } from '../schema.js';

export const PersonSchema = {
    type: "object",
    properties: {
        name: {
            type: "string",
        },
        age: {
            type: "number",
            default: 30,
            minimum: 0,
            maximum: 100,
            conditionals: [
                // when the age is less than 18 then email becomes transient.
                {
                    path: "$.properties.email",
                    value: {
                        transient: true,
                    },
                    match: {
                        exclusiveMaximum: 18,
                    }
                }
            ]
        },
        email: {
            type: "string",
        },
    },
    additionalProperties: false,
} as const satisfies Schema;

export const PersonSchemaWithOneOf = {
    type: "object",
    properties: {
        name: {
            type: "string",
        },
        species: {
            type: "string",
            oneOf: [
                {
                    const: "human",
                    conditionals: [
                        {
                            path: "$.properties.email",
                            value: {
                                transient: false,
                            }
                        }
                    ]
                },
                {
                    const: "robot",
                    conditionals: [
                        {
                            path: "$.properties.email",
                            value: {
                                mutable: false,
                            }
                        }
                    ]
                }
            ]
        },
        email: {
            type: "string",
        },
    },
    additionalProperties: false,
} as const satisfies Schema;

export const PersonSchemaRootConditions = {
    type: "object",
    properties: {
        name: {
            type: "string",
        },
        species: {
            type: "string",
            oneOf: [
                {
                    const: "human",
                },
                {
                    const: "robot",
                }
            ]
        },
        email: {
            type: "string",
        },
    },
    conditionals: [
        // if the name length is less than 3 then the email becomes transient.
        {
            path: "$.properties.email",
            value: {
                transient: true,
            },
            match: {
                properties: {
                    name: {
                        maxLength: 2,
                    }
                }
            }
        },
        // if the name length is greater than 3 and the species is human then the email is not transient.
        {
            path: "$.properties.email",
            value: {
                transient: false,
            },
            match: {
                properties: {
                    name: {
                        minLength: 3,
                    },
                    species: {
                        const: "human",
                    }
                }
            }
        }
    ],
    additionalProperties: false,
} as const satisfies Schema;

describe('enumeratePatches', () => {
    it('should not enumerate patches when the local condition is not met', () => {
        const patches = [...enumeratePatches(PersonSchema, {
            name: "John Doe",
            age: 20,
        })];
        expect(patches).toEqual([
        ]);
    });
    it('should enumerate patches when the local condition is met', () => {
        const patches = [...enumeratePatches(PersonSchema, {
            name: "John Doe",
            age: 10,
        })];
        expect(patches).toEqual([
            { path: ["$", "properties", "email"], fragment: { transient: true } },
        ]);
    });
    it('should match on oneOf cases for human', () => {
        const patches = [...enumeratePatches(PersonSchemaWithOneOf, {
            name: "John Doe",
            species: "human",
        })];
        expect(patches).toEqual([
            { path: ["$", "properties", "email"], fragment: { transient: false } },
        ]);
    });
    it('should match on oneOf cases for robot', () => {
        const patches = [...enumeratePatches(PersonSchemaWithOneOf, {
            name: "John Doe",
            species: "robot",
        })];
        expect(patches).toEqual([
            { path: ["$", "properties", "email"], fragment: { mutable: false } },
        ]);
    });
    it('should match on complex root conditions', () => {
        const patches = [...enumeratePatches(PersonSchemaRootConditions, {
            name: "John Doe",
            species: "human",
        })];
        expect(patches).toEqual([
            { path: ["$", "properties", "email"], fragment: { transient: false } },
        ]);
    });
    it('should match on simple root conditions', () => {
        const patches = [...enumeratePatches(PersonSchemaRootConditions, {
            name: "ab",
            species: "human",
        })];
        expect(patches).toEqual([
            { path: ["$", "properties", "email"], fragment: { transient: true } },
        ]);
    });
});
