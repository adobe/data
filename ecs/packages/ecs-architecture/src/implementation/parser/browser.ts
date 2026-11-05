// © 2026 Adobe. MIT License. See /LICENSE for details.
/// <reference lib="dom" />
/// <reference types="vite/client" />
import { instantiate } from '@oxc-parser/binding-wasm32-wasip1/workerd';
import wasm from '@oxc-parser/binding-wasm32-wasip1/wasm?url';
import type { LoadParser } from '../syntax.js';
import { bindingParser } from './binding-parser.js';
import { once } from './once.js';

/** oxc's WebAssembly parser, the one inside Vite's, fetched and compiled on the first call. */
export const loadParser: LoadParser = once(async () => bindingParser(await instantiate(WebAssembly.compileStreaming(fetch(wasm)))));
