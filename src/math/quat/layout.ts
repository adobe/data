// © 2026 Adobe. MIT License. See /LICENSE for details.

import { getStructLayout } from "../../typed-buffer/index.js";
import { schema } from "./schema.js";

export const layout = getStructLayout(schema);

