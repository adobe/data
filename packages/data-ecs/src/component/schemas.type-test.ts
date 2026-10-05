import { Schema } from "../schema/schema.js";

const ok: Schema.ForType<true> = { type: 'boolean', const: true };
const okObj: Schema.ForType<{ readonly x: number; readonly tags: readonly string[] }> = {
    type: 'object',
    properties: { x: { type: 'number' }, tags: { type: 'array', items: { type: 'string' } } },
};
// @ts-expect-error string schema does not describe a number
const bad: Schema.ForType<number> = { type: 'string' };
// @ts-expect-error const must match the type
const badConst: Schema.ForType<true> = { type: 'boolean', const: false };
void [ok, okObj, bad, badConst];
