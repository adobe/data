// © 2026 Adobe. MIT License. See /LICENSE for details.
import { Schema } from "../schema/index.js";
import { I32 } from "../math/i32/index.js";

export type Entity = Schema.ToType<typeof Entity.schema>;
export namespace Entity {
    export const schema = I32.schema;
}
