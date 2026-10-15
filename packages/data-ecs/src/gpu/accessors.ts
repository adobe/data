import { layoutOf, type Leaf } from '../layout/layout.js';
import { declarationOf } from '../registry/create-registry.js';
import type { Shader } from '../system/render.js';

/** A WGSL function reading one component of a row from the GPU copy of a render system's table. */
export type Accessor = { readonly name: string; readonly component: string | symbol; readonly code: string };

const typeOf = (leaf: Leaf): string | null => {
    if (leaf.scalar === "boolean") return leaf.view === "u32" ? "bool" : null;
    return leaf.view === "f32" || leaf.view === "u32" || leaf.view === "i32" ? leaf.view : null;
};

const readOf = (leaf: Leaf, word: string): string => {
    const element = `ecs_heap[${word}]`;
    switch (leaf.scalar) {
        case "boolean": return `(${element} != 0u)`;
        case "f32": return `bitcast<f32>(${element})`;
        case "i32": return `bitcast<i32>(${element})`;
        default: return element;
    }
};

/** WGSL keywords and reserved words an accessor can't be named. */
const reserved = new Set(("alias break case const const_assert continue continuing default diagnostic discard else enable false fn for if let loop override requires return struct switch true var while "
    + "NULL Self abstract active alignas alignof as asm asm_fragment async attribute auto await become cast catch class co_await co_return co_yield coherent column_major common compile compile_fragment concept const_cast consteval constexpr constinit crate debugger decltype delete demote demote_to_helper do dynamic_cast enum explicit export extends extern external fallthrough filter final finally friend from fxgroup get goto groupshared highp impl implements import inline instanceof interface layout lowp macro macro_rules match mediump meta mod module move mut mutable namespace new nil noexcept noinline nointerpolation non_coherent noncoherent noperspective null nullptr of operator package packoffset partition pass patch pixelfragment precise precision premerge priv protected pub public readonly ref regardless register reinterpret_cast require resource restrict self set shared sizeof smooth snorm static static_assert static_cast std subroutine super target template this thread_local throw trait try type typedef typeid typename typeof union unless unorm unsafe unsized use using varying virtual volatile wgsl where with writeonly yield").split(" "));

/**
 * Accessors for a render system's shader, in `accessors` order, or the reason one can't be read on the GPU: scalars
 * and tuples of two to four scalars of one type, laid out in 4-byte words.
 */
export const accessorsOf = (shader: Shader): readonly Accessor[] | string => {
    const accessors: Accessor[] = [];
    const entries = Object.entries(shader.accessors);
    // A table record is a row count, then a word address per accessor.
    if (entries.length > 63) return "it names more than 63 accessors";
    for (const [name, key] of entries) {
        const component = String(key);
        if (!/^[A-Za-z][A-Za-z0-9_]*$/.test(name) || name.startsWith("ecs_") || reserved.has(name)) return `"${name}" isn't usable as a WGSL function name`;
        const declaration = declarationOf(key);
        if (declaration === undefined) return `"${component}" has no registered schema`;
        const layout = layoutOf(declaration.type);
        if (layout.kind !== "linear") return `"${component}" isn't stored in linear memory`;
        const { leaves, stride } = layout;
        const types = leaves.map(typeOf);
        if (stride % 4 !== 0 || leaves.some(leaf => leaf.offset % 4 !== 0) || types.some(type => type === null)) {
            return `"${component}" isn't laid out in 4-byte words of f32, i32, u32 or booleans; give it a "storage" or "vertex" layout or 4-byte scalars`;
        }
        const words = stride / 4;
        const word = (leaf: Leaf): string => `ecs_table.ecs_${name} + row * ${words}u + ${leaf.offset / 4}u`;
        const [first] = leaves;
        if (leaves.length === 1 && first.path.length === 0) {
            accessors.push({ name, component: key, code: `fn ${name}(row: u32) -> ${types[0]} { return ${readOf(first, word(first))}; }` });
            continue;
        }
        const tuple = leaves.length >= 2 && leaves.length <= 4 && leaves.every((leaf, i) => leaf.path.length === 1 && leaf.path[0] === i && types[i] === types[0]);
        if (!tuple) return `"${component}" isn't a scalar or a tuple of two to four scalars of one type`;
        const items = leaves.map(leaf => readOf(leaf, word(leaf))).join(", ");
        accessors.push({ name, component: key, code: `fn ${name}(row: u32) -> vec${leaves.length}<${types[0]}> { return vec${leaves.length}<${types[0]}>(${items}); }` });
    }
    return accessors;
};

/** The WGSL declarations of a render system's bind group and accessors. */
export const declarationsOf = (group: number, accessors: readonly Accessor[]): string => [
    `@group(${group}) @binding(0) var<storage, read> ecs_heap: array<u32>;`,
    `struct EcsTable { ecs_rows: u32, ${accessors.map(accessor => `ecs_${accessor.name}: u32`).join(", ")} }`,
    `@group(${group}) @binding(1) var<uniform> ecs_table: EcsTable;`,
    `fn ecs_count() -> u32 { return ecs_table.ecs_rows; }`,
    ...accessors.map(accessor => accessor.code),
    "",
].join("\n");
