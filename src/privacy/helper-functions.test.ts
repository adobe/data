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
import { PrivacyOptions } from "./types.js";
import { 
    shouldIncludeComponentForSerialization, 
    filterColumnForPrivacy, 
    getFilteredColumn, 
    filterTableForPrivacy 
} from "./helper-functions.js";
import { describe, expect, test } from "vitest";
import { Schema } from "../schema/index.js";

describe("Privacy Helper Functions", () => {
    test("shouldIncludeComponentForSerialization works correctly", () => {
        const testCases: { schema: Schema; options?: PrivacyOptions; expected: boolean; description: string }[] = [
            { 
                schema: { type: "string", privacy: "strictlyNecessary" }, 
                options: { strictlyNecessary: true }, 
                expected: true, 
                description: "strictlyNecessary with permission" 
            },
            { 
                schema: { type: "string", privacy: "strictlyNecessary" }, 
                options: undefined, 
                expected: true, 
                description: "strictlyNecessary without options (default)" 
            },
            { 
                schema: { type: "string", privacy: "functional" }, 
                options: { functional: true }, 
                expected: true, 
                description: "functional with permission" 
            },
            { 
                schema: { type: "string", privacy: "functional" }, 
                options: { functional: false }, 
                expected: false, 
                description: "functional without permission" 
            },
            { 
                schema: { type: "string", privacy: "performance" }, 
                options: { performance: true }, 
                expected: true, 
                description: "performance with permission" 
            },
            { 
                schema: { type: "string", privacy: "performance" }, 
                options: { performance: false }, 
                expected: false, 
                description: "performance without permission" 
            },
            { 
                schema: { type: "string", privacy: "advertising" }, 
                options: { advertising: true }, 
                expected: true, 
                description: "advertising with permission" 
            },
            { 
                schema: { type: "string", privacy: "advertising" }, 
                options: { advertising: false }, 
                expected: false, 
                description: "advertising without permission" 
            },
            { 
                schema: { type: "string" }, 
                options: {}, 
                expected: true, 
                description: "no privacy classification (always included)" 
            },
            { 
                schema: { type: "string" }, 
                options: { strictlyNecessary: false, functional: false, performance: false, advertising: false }, 
                expected: true, 
                description: "no privacy classification with all permissions false" 
            },
        ];

        for (const testCase of testCases) {
            const result = shouldIncludeComponentForSerialization(testCase.schema, testCase.options);
            expect(result).toBe(testCase.expected);
        }
    });

    test("filterColumnForPrivacy replaces data with default values", () => {
        const schema: Schema = { type: "string", default: "defaultValue" };
        const rows = 3;
        const originalData = ["value1", "value2", "value3"];

        const result = filterColumnForPrivacy(schema, rows, originalData);
        
        expect(result).toEqual(["defaultValue", "defaultValue", "defaultValue"]);
    });

    test("filterColumnForPrivacy handles empty data", () => {
        const schema: Schema = { type: "string", default: "defaultValue" };
        const rows = 0;
        const originalData: string[] = [];

        const result = filterColumnForPrivacy(schema, rows, originalData);
        
        expect(result).toEqual([]);
    });

    test("filterColumnForPrivacy handles null/undefined data", () => {
        const schema: Schema = { type: "string", default: "defaultValue" };
        const rows = 2;

        expect(filterColumnForPrivacy(schema, rows, null)).toBe(null);
        expect(filterColumnForPrivacy(schema, rows, undefined)).toBe(undefined);
    });

    test("getFilteredColumn returns original data when component should be included", () => {
        const componentSchemas = {
            allowedComponent: { type: "string", privacy: "strictlyNecessary" }
        };
        const privacyOptions: PrivacyOptions = { strictlyNecessary: true };
        const originalData = ["value1", "value2"];
        const rows = 2;

        const [name, data] = getFilteredColumn("allowedComponent", privacyOptions, originalData, componentSchemas as Record<string, Schema>, rows);
        
        expect(name).toBe("allowedComponent");
        expect(data).toBe(originalData);
    });

    test("getFilteredColumn returns filtered data when component should be excluded", () => {
        const componentSchemas = {
            blockedComponent: { type: "string", privacy: "advertising", default: "blocked" }
        };
        const privacyOptions: PrivacyOptions = { strictlyNecessary: true };
        const originalData = ["value1", "value2"];
        const rows = 2;

        const [name, data] = getFilteredColumn("blockedComponent", privacyOptions, originalData, componentSchemas as Record<string, Schema>, rows);
        
        expect(name).toBe("blockedComponent");
        expect(data).toEqual(["blocked", "blocked"]);
    });

    test("filterTableForPrivacy filters table columns based on privacy", () => {
        const componentSchemas = {
            allowedComponent: { type: "string", privacy: "strictlyNecessary" },
            blockedComponent: { type: "string", privacy: "advertising", default: "filtered" }
        };
        const privacyOptions: PrivacyOptions = { strictlyNecessary: true };
        
        const table = {
            rows: 2,
            columns: {
                allowedComponent: ["allowed1", "allowed2"],
                blockedComponent: ["blocked1", "blocked2"]
            }
        };

        const result = filterTableForPrivacy(componentSchemas as Record<string, Schema>, table, privacyOptions);
        
        expect(result.rows).toBe(2);
        expect(result.columns.allowedComponent).toEqual(["allowed1", "allowed2"]);
        expect(result.columns.blockedComponent).toEqual(["filtered", "filtered"]);
    });

    test("filterTableForPrivacy preserves table structure", () => {
        const componentSchemas = {
            comp1: { type: "string", privacy: "functional", default: "default1" },
            comp2: { type: "number", privacy: "performance", default: 0 }
        };
        const privacyOptions: PrivacyOptions = { functional: true };
        
        const table = {
            rows: 3,
            columns: {
                comp1: ["a", "b", "c"],
                comp2: [1, 2, 3]
            }
        };

        const result = filterTableForPrivacy(componentSchemas as Record<string, Schema>, table, privacyOptions);
        
        expect(result.rows).toBe(3);
        expect(Object.keys(result.columns)).toEqual(["comp1", "comp2"]);
        expect(result.columns.comp1).toEqual(["a", "b", "c"]);
        expect(result.columns.comp2).toEqual([0, 0, 0]);
    });
});
