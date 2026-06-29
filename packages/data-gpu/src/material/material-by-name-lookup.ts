// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Entity } from "@adobe/data/ecs";

/** Store or transaction surface that exposes the material name index. */
export interface MaterialByNameLookup {
    indexes: {
        materialByName: { get(args: { name: string }): Entity | null };
    };
}
