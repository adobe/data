// © 2026 Adobe. MIT License. See /LICENSE for details.
import * as components from "../../persistent-database/components/index.js";

// A user entity carries the shared `name` (its join key with todo assignees).
export const User = ["user", "name"] as const satisfies Array<keyof typeof components>;
