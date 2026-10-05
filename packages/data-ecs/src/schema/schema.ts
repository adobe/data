
interface ObjectSchema<K extends string = string> {
    type: 'object',
    const?: Record<K, Schema>;
    properties: Record<K, Schema>;
    required?: K[];
}

interface StringSchema {
    type: 'string';
    const?: string;
    minLength?: number;
    maxLength?: number;
}

interface ArraySchema<T extends Schema> {
    type: 'array';
    const?: readonly T[];
    items: T;
}

interface NumberSchema {
    type: 'number';
    const?: number;
    minimum?: number;
    maximum?: number;
    precision?: 1 | 2;
}

interface IntegerSchema {
    type: 'integer';
    const?: number;
    minimum?: number;
    maximum?: number;
}

interface BooleanSchema {
    type: 'boolean';
    const?: boolean;
}

export type Schema = ObjectSchema | StringSchema | ArraySchema<Schema> | NumberSchema | IntegerSchema | BooleanSchema;

export namespace Schema {
    export type ToType<T extends Schema> = 
        T extends ObjectSchema<infer K> ? { readonly [P in K]: Schema.ToType<T['properties'][P]> } :
        T extends StringSchema ? string :
        T extends ArraySchema<infer U> ? readonly Schema.ToType<U>[] :
        T extends NumberSchema ? number :
        T extends IntegerSchema ? number :
        T extends BooleanSchema ? boolean :
        never;

    /** The schemas whose `ToType` is `T`; constrains a schema to describe a known type. */
    export type ForType<T> =
        [T] extends [true] ? BooleanSchema & { const: T } :
        [T] extends [false] ? BooleanSchema & { const: T } :
        [T] extends [boolean] ? BooleanSchema :
        [T] extends [string] ? StringSchema :
        [T] extends readonly [number] ? (NumberSchema | IntegerSchema) :
        T extends readonly (infer U)[] ? ArraySchema<ForType<U> & Schema> :
        T extends object ? ObjectSchema<Extract<keyof T, string>> & { properties: { [P in keyof T]-?: ForType<T[P]> } } :
        never;
}
