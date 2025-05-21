import { describe, it, expect } from 'vitest';
import { enumeratePatches } from './enumerate-patches.js';
import { FromSchema, Schema } from '../schema.js';

export const PersonSchema = {
    type: "object",
    properties: {
        name: {
            type: "string",
            ui: {
                name: "Name",
                placeholder: "John Doe",
            }
        },
        age: {
            type: "number",
            default: 30,
            minimum: 0,
            maximum: 100,
            ui: {
                name: "Age",
            },
            conditionals: [
                // when the age is less than 18 then email is not visible.
                {
                    path: "$.properties.email.ui",
                    value: {
                        visible: false,
                    },
                    match: {
                        exclusiveMaximum: 18,
                    }
                }
            ]
        },
        email: {
            type: "string",
            ui: {
                name: "Email",
                placeholder: "john.doe@example.com",
            }
        },
    },
    additionalProperties: false,
} as const satisfies Schema;

export const PersonSchemaWithOneOf = {
    type: "object",
    properties: {
        name: {
            type: "string",
            ui: {
                name: "Name",
                placeholder: "John Doe",
            }
        },
        species: {
            type: "string",
            oneOf: [
                {
                    const: "human",
                    conditionals: [
                        {
                            path: "$.properties.email.ui",
                            value: {
                                visible: true,
                            }
                        }
                    ]
                },
                {
                    const: "robot",
                    conditionals: [
                        {
                            path: "$.properties.email.ui",
                            value: {
                                enabled: false,
                            }
                        }
                    ]
                }
            ]
        },
        email: {
            type: "string",
            ui: {
                name: "Email",
                placeholder: "john.doe@example.com",
            }
        },
    },
    additionalProperties: false,
} as const satisfies Schema;

export const PersonSchemaRootConditions = {
    type: "object",
    properties: {
        name: {
            type: "string",
            ui: {
                name: "Name",
                placeholder: "John Doe",
            }
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
            ui: {
                name: "Email",
                placeholder: "john.doe@example.com",
            }
        },
    },
    conditionals: [
        // if the name length is less than 3 then the email is not visible.
        {
            path: "$.properties.email.ui",
            value: {
                visible: false,
            },
            match: {
                properties: {
                    name: {
                        maxLength: 2,
                    }
                }
            }
        },
        // if the name length is greater than 3 and the species is human then the email is visible.
        {
            path: "$.properties.email.ui",
            value: {
                visible: true,
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
            { path: ["$", "properties", "email", "ui"], fragment: { visible: false } },
        ]);
    });
    it('should match on oneOf cases for human', () => {
        const patches = [...enumeratePatches(PersonSchemaWithOneOf, {
            name: "John Doe",
            species: "human",
        })];
        expect(patches).toEqual([
            { path: ["$", "properties", "email", "ui"], fragment: { visible: true } },
        ]);
    });
    it('should match on oneOf cases for robot', () => {
        const patches = [...enumeratePatches(PersonSchemaWithOneOf, {
            name: "John Doe",
            species: "robot",
        })];
        expect(patches).toEqual([
            { path: ["$", "properties", "email", "ui"], fragment: { enabled: false } },
        ]);
    });
    it('should match on complex root conditions', () => {
        const patches = [...enumeratePatches(PersonSchemaRootConditions, {
            name: "John Doe",
            species: "human",
        })];
        expect(patches).toEqual([
            { path: ["$", "properties", "email", "ui"], fragment: { visible: true } },
        ]);
    });
    it('should match on simple root conditions', () => {
        const patches = [...enumeratePatches(PersonSchemaRootConditions, {
            name: "ab",
            species: "human",
        })];
        expect(patches).toEqual([
            { path: ["$", "properties", "email", "ui"], fragment: { visible: false } },
        ]);
    });
});
