// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Schema } from "../../schema/index.js";

export type State<S extends Schema = Schema> = {
    schema: S;
    value: Schema.ToType<S>;
};
