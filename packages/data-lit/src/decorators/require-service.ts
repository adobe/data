// © 2026 Adobe. MIT License. See /LICENSE for details.

export function requireService() {
    return function (
        target: any,
        propertyKey: string,
        descriptor: PropertyDescriptor
    ) {
        const originalRender = descriptor.value;

        descriptor.value = function (this: any) {
            if (!this.service) {
                return null;
            }
            return originalRender.call(this);
        };

        return descriptor;
    };
} 