// © 2026 Adobe. MIT License. See /LICENSE for details.

export type Mutable<T> = T extends readonly (infer U)[]
    ? U[] extends T  // If T is a tuple (not a general array)
        ? MutableArray<T>  // Handle general arrays
        : MutableTuple<T>  // Handle tuples
    : T extends object
    ? T extends Function | Date | RegExp | Error | Promise<any>  // Skip built-in objects
      ? T
      : MutableObject<T>  // Handle plain objects
    : T;  // Handle primitives

export type MutableObject<T> = {
    -readonly [P in keyof T]: Mutable<T[P]>;
};

export type MutableArray<T extends readonly any[]> = T[number][] & MutableObject<T>;

export type MutableTuple<T extends readonly any[]> = {
    -readonly [K in keyof T]: Mutable<T[K]>;
};

// Compile-time type checks to verify Mutable<T> behavior
{
    // Helper types for assertions
    type True<T extends true> = T;
    type False<T extends false> = T;
    type IsNever<T extends never> = true;
    type NotNever<T> = T extends never ? false : true;
    type EquivalentTypes<A, B> = [A] extends [B] ? [B] extends [A] ? true : false : false;

    // Test cases for tuples vs arrays
    type Vec3 = readonly [number, number, number];
    type StringArray = readonly string[];
    type MixedTuple = readonly [string, number, boolean];
    type EmptyTuple = readonly [];
    
    // Vec3 should become mutable tuple [number, number, number]
    type CheckVec3Mutable = True<EquivalentTypes<Mutable<Vec3>, [number, number, number]>>;
    
    // Empty tuple should remain empty but mutable
    type CheckEmptyTupleMutable = True<EquivalentTypes<Mutable<EmptyTuple>, []>>;
    
    // Mixed tuple should retain structure but become mutable
    type CheckMixedTupleMutable = True<EquivalentTypes<Mutable<MixedTuple>, [string, number, boolean]>>;
    
    // String array should become mutable array but keep string element type
    type CheckStringArrayMutable = [
        Mutable<StringArray> extends string[] ? true : false,
        Mutable<StringArray> extends readonly string[] ? false : true
    ];
    type CheckStringArrayCorrect = CheckStringArrayMutable extends [true, true] ? true : false;

    // Test deep readonly objects
    type DeepReadonlyObj = {
        readonly id: number;
        readonly name: string;
        readonly position: readonly [number, number, number];
        readonly tags: readonly string[];
        readonly nested: {
            readonly value: boolean;
            readonly items: readonly number[];
        };
    };
    
    type ExpectedMutableObj = {
        id: number;
        name: string;
        position: [number, number, number];
        tags: string[];
        nested: {
            value: boolean;
            items: number[];
        };
    };
    
    // Deep readonly object should become fully mutable
    type CheckDeepObjectMutable = True<EquivalentTypes<Mutable<DeepReadonlyObj>, ExpectedMutableObj>>;

    // Test primitives - should remain unchanged
    type CheckStringMutable = True<EquivalentTypes<Mutable<string>, string>>;
    type CheckNumberMutable = True<EquivalentTypes<Mutable<number>, number>>;
    type CheckBooleanMutable = True<EquivalentTypes<Mutable<boolean>, boolean>>;

    // Test built-in objects - should remain unchanged
    type CheckDateMutable = True<EquivalentTypes<Mutable<Date>, Date>>;
    type CheckFunctionMutable = True<EquivalentTypes<Mutable<Function>, Function>>;

    // Test special cases
    type NullMutable = True<EquivalentTypes<Mutable<null>, null>>;
    type UndefinedMutable = True<EquivalentTypes<Mutable<undefined>, undefined>>;
}
