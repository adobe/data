// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference types="node" />
import { readFile } from 'node:fs/promises';
import { createRequire } from 'node:module';
import { instantiate as instantiateParser } from '@oxc-parser/binding-wasm32-wasip1/workerd';
import { instantiate as instantiateTransformer } from '@oxc-transform/binding-wasm32-wasip1/workerd';
import { oxcParse, oxcStrip } from './oxc.js';

const require = createRequire(import.meta.url);

type WasmHost = { readonly parse: ReturnType<typeof oxcParse>; readonly strip: ReturnType<typeof oxcStrip> };

/** Each binding instantiates once per thread. */
let loading: Promise<WasmHost> | null = null;

/** The memory compiler's parser and type stripper over oxc's WASM bindings, as a browser loads them, in node. */
export const wasmHost = (): Promise<WasmHost> => loading ??= Promise.all([
    readFile(require.resolve("@oxc-parser/binding-wasm32-wasip1/wasm")).then(bytes => WebAssembly.compile(bytes)).then(instantiateParser),
    readFile(require.resolve("@oxc-transform/binding-wasm32-wasip1/wasm")).then(bytes => WebAssembly.compile(bytes)).then(instantiateTransformer),
]).then(([parser, transformer]) => ({ parse: oxcParse(parser), strip: oxcStrip(transformer) }));
