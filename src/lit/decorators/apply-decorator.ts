// © 2026 Adobe. MIT License. See /LICENSE for details.

export function applyDecorator(
    target: any,
    propertyKey: string,
    decorator: (target: any, propertyKey: string, descriptor: PropertyDescriptor) => PropertyDescriptor
) {
    // Get the prototype chain
    let currentPrototype = target;
    let descriptor: PropertyDescriptor | undefined;

    // Walk up the prototype chain until we find the property
    while (currentPrototype && !descriptor) {
        descriptor = Object.getOwnPropertyDescriptor(currentPrototype, propertyKey);
        if (!descriptor) {
            currentPrototype = Object.getPrototypeOf(currentPrototype);
        }
    }

    if (!descriptor) {
        throw new Error(`Property ${propertyKey} not found in prototype chain`);
    }

    const newDescriptor = decorator(target, propertyKey, descriptor);
    Object.defineProperty(target, propertyKey, newDescriptor);
} 