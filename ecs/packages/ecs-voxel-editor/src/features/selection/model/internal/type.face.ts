// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Vec3 } from "@adobe/ecs";

/** A side of a cell: `side` `0` to `5` for `+x`, `-x`, `+y`, `-y`, `+z` and `-z`. */
export type Face = {
    readonly cell: Vec3.I32;
    readonly side: number;
};
