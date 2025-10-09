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
import { Schema } from "../schema/index.js";

/**
 * Checks if a component should be included for serialization
 * @param component - The component to check
 * @param privacyOptions
 * @returns Whether the component should be included
 */
export const shouldIncludeComponentForSerialization = (schema: Schema, privacyOptions?: PrivacyOptions): boolean => {
    // const schema = componentSchemas[component as keyof C];
    // if the component has no privacy attribute, it is considered as necessary.
    // this is to maintain backwards compatibility with existing schemas
    if (!schema?.privacy) {
        return true;
    }
    // Check the privacy attribute
    return !schema.privacy || (privacyOptions?.[schema.privacy] ?? (schema.privacy === 'strictlyNecessary'));
}

/**
 * Filters a column for privacy by replacing its data with default values if it contains any data.
 * @param schema - The schema of the component
 * @param rows - The number of rows in the table
 * @param data - The data of the column
 * @returns The filtered column containing default values
 */
export const filterColumnForPrivacy = (schema: Schema, rows: any, data: any) => {
    let value = data;
    // If the column has no data and the filtered component has a default, use the default
    if (value !== undefined && value !== null && (Array.isArray(value) && value.length !== 0)) {
        // Create array filled with default values for the number of rows
        if (rows > 0) {
            value = new Array(rows).fill(schema.default);
        } else {
            value = [];
        }
    }
    console.warn(`Updated column for schema ${JSON.stringify(schema)} with rows: ${rows}, original data: ${JSON.stringify(data)}, resulting value: ${JSON.stringify(value)} for privacy filter`);
    return value;
}

/**
 * Gets a filtered column based on privacy options
 * @param name - The name of the component
 * @param privacyOptions
 * @param data - The data of the column
 * @param componentSchemas
 * @param rows - The number of rows in the table
 * @returns A tuple containing the name of the component and the filtered column data
 */
export const getFilteredColumn = (name: string, privacyOptions: PrivacyOptions | undefined, data: any, componentSchemas: Record<string, Schema>, rows: number) => {
    const schema = componentSchemas[name];
    if (shouldIncludeComponentForSerialization(schema, privacyOptions)) {
        return [name, data];
    } else {
        return [name, filterColumnForPrivacy(componentSchemas[name], rows, data)];
    }
}

/**
 * Filters a table for privacy based on the filtered components.
 * @param filteredComponents - The components to filter
 * @param table - The table to filter
 * @param options - The privacy options to use
 * @returns The filtered table
 */
export const filterTableForPrivacy = (filteredComponents: Record<string, Schema>, table: any, options: any) => {
    // filter the tables for privacy based on the filtered components.
    const {rows, columns} = table;
    const filteredColumns = Object.fromEntries(
        Object.entries(columns)
            .map(([name, data]) => {
                return getFilteredColumn(name, options, data, filteredComponents, rows);
            })
    );

    return {
        rows,
        columns: filteredColumns,
    };
}
