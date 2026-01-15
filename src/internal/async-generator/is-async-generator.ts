// © 2026 Adobe. MIT License. See /LICENSE for details.

export function isAsyncGenerator<T>(value: any): value is AsyncGenerator<T> {
    return value && typeof value[Symbol.asyncIterator] === 'function';
}
