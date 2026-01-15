// © 2026 Adobe. MIT License. See /LICENSE for details.

// Create a WeakMap to store cached values for each object
const cache = new WeakMap<object, Map<Function, unknown>>();

/**
 * Gets a cached value for an object using a factory function.
 * If the value hasn't been cached yet, the factory function will be called to create it.
 * The cache is stored on the object itself using a WeakMap, allowing for garbage collection
 * when the object is no longer referenced.
 * 
 * @param context The object to cache the value on
 * @param factory A function that creates the value to be cached
 * @returns The cached value or a newly created value from the factory
 */
export function getCached<A extends object, B>(
    context: A,
    factory: (obj: A) => B
): B {
    // Get or create the factory map for this object
    let factoryMap = cache.get(context) as Map<Function, B> | undefined;
    if (!factoryMap) {
        factoryMap = new Map();
        cache.set(context, factoryMap);
    }

    // Get or create the cached value for this factory
    let value = factoryMap.get(factory);
    if (value === undefined) {
        value = factory(context);
        factoryMap.set(factory, value);
    }

    return value;
} 