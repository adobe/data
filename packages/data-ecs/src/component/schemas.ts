import type { Schema } from "../schema/schema.js";
import { Component } from "./component.js";

export const schemas: { [K in keyof Component.Types]?: Schema.ForType<Component.Types[K]> } = {};
