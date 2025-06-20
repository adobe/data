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
import { TypedArray } from "../internal/typed-array/index.js";

export interface ReadonlyTypedBuffer<T> {
    readonly size: number;
    get(index: number): T;
    [Symbol.iterator](): IterableIterator<T>;
}

export interface TypedBuffer<T> extends ReadonlyTypedBuffer<T> {
    size: number;                 // drops `readonly`
    set(index: number, value: T): void;
    copyWithin(target: number, start: number, end: number): void;

    /**
     * Returns the typed array of the buffer.
     * @throws If the buffer is not backed by a typed array.
     */
    getTypedArray(): TypedArray;
}

