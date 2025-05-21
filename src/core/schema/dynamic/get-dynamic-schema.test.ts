import { describe, it, expect } from 'vitest';
import { getDynamicSchema } from './get-dynamic-schema.js';
import { PersonSchema, PersonSchemaWithOneOf, PersonSchemaRootConditions } from './enumerate-patches.test.js';
import { Schema } from '../schema.js';

describe('getDynamicSchema', () => {
    it('should not modify schema when local condition is not met', () => {
        const dynamicSchema = getDynamicSchema(PersonSchema, {
            name: "John Doe",
            age: 20,
        });

        // Email UI should remain unchanged
        expect(dynamicSchema.properties?.email?.ui).toEqual({
            name: "Email",
            placeholder: "john.doe@example.com",
        });
    });

    it('should modify schema when local condition is met', () => {
        const dynamicSchema = getDynamicSchema(PersonSchema, {
            name: "John Doe",
            age: 10,
        });

        // Email UI should be hidden
        expect(dynamicSchema.properties?.email?.ui).toEqual({
            name: "Email",
            placeholder: "john.doe@example.com",
            visible: false,
        });
    });

    it('should apply oneOf conditions for human', () => {
        const dynamicSchema = getDynamicSchema(PersonSchemaWithOneOf, {
            name: "John Doe",
            species: "human",
        });

        // Email UI should be visible
        expect(dynamicSchema.properties?.email?.ui).toEqual({
            name: "Email",
            placeholder: "john.doe@example.com",
            visible: true,
        });
    });

    it('should apply oneOf conditions for robot', () => {
        const dynamicSchema = getDynamicSchema(PersonSchemaWithOneOf, {
            name: "John Doe",
            species: "robot",
        });

        // Email UI should be disabled
        expect(dynamicSchema.properties?.email?.ui).toEqual({
            name: "Email",
            placeholder: "john.doe@example.com",
            enabled: false,
        });
    });

    it('should apply complex root conditions', () => {
        const dynamicSchema = getDynamicSchema(PersonSchemaRootConditions, {
            name: "John Doe",
            species: "human",
        });

        // Email UI should be visible due to name length > 3 and species being human
        expect(dynamicSchema.properties?.email?.ui).toEqual({
            name: "Email",
            placeholder: "john.doe@example.com",
            visible: true,
        });
    });

    it('should apply simple root conditions', () => {
        const dynamicSchema = getDynamicSchema(PersonSchemaRootConditions, {
            name: "ab",
            species: "human",
        });

        // Email UI should be hidden due to name length <= 2
        expect(dynamicSchema.properties?.email?.ui).toEqual({
            name: "Email",
            placeholder: "john.doe@example.com",
            visible: false,
        });
    });

    it('should throw error when target node is not an object', () => {
        const invalidSchema = {
            type: "object",
            properties: {
                name: {
                    type: "string",
                    conditionals: [{
                        path: "$.type",  // targeting a string, not an object
                        value: { visible: false }
                    }]
                }
            }
        } as const satisfies Schema;

        expect(() => getDynamicSchema(invalidSchema, {
            name: "John Doe"
        })).toThrow('Target node MUST be an object');
    });
}); 