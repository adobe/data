// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Database } from "@adobe/data/ecs";
import { physicsRenderBridge } from "../graphics/rendering/pbr-render/physics-bridge-plugin.js";
import { voxelShapeLoader } from "./voxel-shape-loader-plugin.js";
import { voxelShape, voxelShapeVisualBridge } from "./voxel-shape-plugin.js";

/** Voxel visuals + async file loader + default collider primitive bridge. */
export const voxelShapeRender = Database.Plugin.combine(
    voxelShape,
    voxelShapeLoader,
    voxelShapeVisualBridge,
    physicsRenderBridge,
);
