// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Attacheds a decorator to a method on an object and reassigns the resulting value back to the object.
 */
export function attachDecorator<T, K extends keyof T>(
    obj: T,
    property: K,
    // eslint-disable-next-line @typescript-eslint/no-explicit-any -- This is a generic type
    decorator: (target: any, propertyKey: string, descriptor: TypedPropertyDescriptor<T[K]>) => PropertyDescriptor
): void {
    // Get the descriptor of the property
    let descriptor = Object.getOwnPropertyDescriptor(obj, property);

    if (!descriptor) {
        if (!obj[property]) {
            throw new Error(`Property ${property.toString()} does not exist on object`);
        }
        descriptor = {
            value: obj[property],
            writable: true,
            enumerable: true,
            configurable: true,
        };
    }

    // Apply the decorator to the descriptor
    const decoratedDescriptor = decorator(obj, String(property), descriptor);

    // Reassign the decorated method back to the object
    obj[property] = decoratedDescriptor.value;
}
