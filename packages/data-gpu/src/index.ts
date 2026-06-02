// © 2026 Adobe. MIT License. See /LICENSE for details.

// --- Scene model (declarative authored data, no camera, no systems) ----------
export { scene } from "./graphics/scene/scene-plugin.js";

// --- Authoring abstractions --------------------------------------------------
export { animation } from "./graphics/animation/animation-plugin.js";
export { AnimationTrack } from "./graphics/animation/animation-track/animation-track.js";
export { InterpolationMode } from "./graphics/animation/interpolation-mode/interpolation-mode.js";

// --- Infrastructure ----------------------------------------------------------
export { core } from "./core/core-plugin.js";
export { graphics } from "./graphics/graphics-plugin.js";

// --- Physics: shared rigid-body data model + pluggable solver seam -----------
export { physicsData } from "./physics/physics-data-plugin.js";
export type { RigidBody } from "./physics/body/rigid-body.js";
export { BodyType } from "./physics/body/body-type/body-type.js";
export { ColliderShape } from "./physics/body/collider-shape/collider-shape.js";
export { cpuXpbd } from "./physics/solvers/cpu-xpbd/cpu-xpbd-plugin.js";

// --- Material registry (authored entities: physical + visible PBR props) ------
export { Material } from "./material/material.js";

// --- Physics: shelved GPU XPBD solver (compute-only, massive-scale path) ------
export { physics } from "./physics/physics-plugin.js";
export type { CollisionEvent } from "./physics/collision-event.js";

// --- System plugins (consumed via aggregators) -------------------------------
export { transform } from "./graphics/scene/node/transform-plugin.js";
export { pbrCore } from "./graphics/rendering/pbr-core-plugin.js";
export { modelLoader } from "./graphics/scene/model/model-loader-plugin.js";
export { pbrSkinning } from "./graphics/rendering/skinning/skinning-plugin.js";
export { picking } from "./graphics/picking/picking-plugin.js";
export type { PickHit } from "./graphics/picking/pick-hit.js";

// --- Rendering ---------------------------------------------------------------
export { rendering } from "./graphics/rendering/rendering-plugin.js";
export { pbrIblRender } from "./graphics/rendering/ibl-render/ibl-render-plugin.js";
export { materialGpu } from "./graphics/rendering/material-gpu/material-gpu-plugin.js";
export { pbrRender } from "./graphics/rendering/pbr-render/pbr-render-plugin.js";
export { physicsRenderBridge } from "./graphics/rendering/pbr-render/physics-bridge-plugin.js";
export { shapeGeometry } from "./graphics/scene/model/shape/shape-geometry-plugin.js";

// --- Types (type + namespace, access .plugin for the ECS plugin) -------------
export { Camera } from "./graphics/camera/camera.js";
export { Light } from "./graphics/scene/light/light.js";
export { Orbit } from "./graphics/camera/orbit/orbit.js";
export { Node } from "./graphics/scene/node/node.js";
export { Model } from "./graphics/scene/model/model.js";
export { Geometry } from "./graphics/scene/model/geometry/geometry.js";
export { SceneUniforms } from "./graphics/scene/scene-uniforms/scene-uniforms.js";
export { StandardVertex } from "./graphics/rendering/standard-vertex/standard-vertex.js";
export { VisibleMaterial } from "./graphics/rendering/visible-material/visible-material.js";

// --- Utilities ---------------------------------------------------------------
export { attachOrbitDrag } from "./graphics/camera/orbit/attach-orbit-drag.js";
export type { OrbitDragService } from "./graphics/camera/orbit/attach-orbit-drag.js";
