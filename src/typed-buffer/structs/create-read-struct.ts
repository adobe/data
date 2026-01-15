// © 2026 Adobe. MIT License. See /LICENSE for details.
import { memoizeFactory } from "../../internal/function/memoize-factory.js";
import type { ReadStruct } from "./read-struct.js";
import type { StructLayout } from "./struct-layout.js";
import { getFieldOffset } from "./get-field-offset.js";

type ViewType = 'f32' | 'i32' | 'u32';
type ViewTypes = Record<ViewType, boolean>;

const generateStructBody = (
    layout: StructLayout,
    parentOffset = '',
    indent = '    ',
    usedViews: ViewTypes = { f32: false, i32: false, u32: false }
): [string, ViewTypes] => {
    if (typeof layout === 'string') {
        usedViews[layout as ViewType] = true;
        return [`__${layout}[${parentOffset}]`, usedViews];
    }

    const entries = layout.type === 'array' ?
        Object.entries(layout.fields).sort((a, b) => +a[0] - +b[0]) :
        Object.entries(layout.fields);

    let body = '';
    for (const [name, field] of entries) {
        const fieldOffset = getFieldOffset(field, parentOffset);
        const [value] = typeof field.type === 'string' ?
            [(`__${field.type}[${fieldOffset}]`), usedViews[field.type as ViewType] = true] :
            generateStructBody(field.type, fieldOffset, indent + '    ', usedViews);

        if (layout.type === 'array') {
            body += `\n${indent}${value},`;
        } else {
            body += `\n${indent}${name}: ${value},`;
        }
    }
    return [layout.type === 'array' ? 
        `[${body}\n${indent.slice(4)}]` : 
        `{${body}\n${indent.slice(4)}}`,
        usedViews
    ];
};


export const createReadStruct = memoizeFactory(<T = unknown>(layout: StructLayout): ReadStruct<T> => {
    const [body, usedViews] = generateStructBody(layout);
    const views = Object.entries(usedViews)
        .filter(([, used]) => used)
        .map(([type]) => `${type}: __${type}`)
        .join(', ');

    const code = `const { ${views} } = data;
index *= ${layout.size / 4};
return ${body};`;
    return new Function('data', 'index', code) as ReadStruct<T>;
});
