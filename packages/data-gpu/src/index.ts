// © 2026 Adobe. MIT License. See /LICENSE for details.

// --- Scene model (declarative authored data, no camera, no systems) ----------
export { scene } from "./graphics/scene/scene-plugin.js";

// --- Authoring abstractions --------------------------------------------------
export { animation } from "./graphics/animation/animation-plugin.js";
export { AnimationTrack } from "./graphics/animation/animation-track/animation-track.js";
export { InterpolationMode } from "./graphics/animation/interpolation-mode/interpolation-mode.js";

// --- Infrastructure ----------------------------------------------------------
export { core } from "./core/core-plugin.js";
export { FrameTime } from "./core/frame-time/frame-time.js";
export { graphics } from "./graphics/graphics-plugin.js";

// --- Physics: shared rigid-body data model + pluggable solver seam -----------
export {
    physicsData,
    RIGID_BODY_COMPONENTS,
    STATIC_COLLIDER_COMPONENTS,
    COLLIDER_PRIMITIVE_RENDER_ARCHETYPES,
} from "./physics/physics-data-plugin.js";
export type { ColliderPrimitiveRenderArchetype } from "./physics/physics-data-plugin.js";
export { physicsClock } from "./physics/physics-clock-plugin.js";
export type { PhysicsClock } from "./physics/physics-clock-plugin.js";
export { jointData } from "./physics/joint/joint-plugin.js";
export type { Joint } from "./physics/joint/joint.js";
export { JointType } from "./physics/joint/joint-type/joint-type.js";
export type { RigidBody } from "./physics/body/rigid-body.js";
export type { StaticCollider } from "./physics/body/static-collider.js";
export { BodyType } from "./physics/body/body-type/body-type.js";
export { ColliderShape } from "./physics/body/collider-shape/collider-shape.js";
export { rapierSolver } from "./physics/solvers/rapier-solver-plugin.js";
export { joltSolver } from "./physics/solvers/jolt-solver-plugin.js";
export { runSolverBenchmark } from "./physics/solvers/solver-benchmark.js";
export type { SolverBenchmarkOptions, SolverBenchmarkResult } from "./physics/solvers/solver-benchmark.js";

// --- Material registry (authored entities: physical + visible PBR props) ------
export { Material } from "./material/material.js";
export { assembleMaterialRow } from "./material/assemble-material-row.js";
export { requireMaterial } from "./material/require-material.js";
export type { MaterialByNameLookup } from "./material/require-material.js";
export { standardMaterialNames } from "./material/standard-materials.js";

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
export { materialPaletteGpu } from "./graphics/rendering/material-palette-gpu/material-palette-gpu-plugin.js";
export { pbrFactorRender } from "./graphics/rendering/pbr-render/pbr-factor-render-plugin.js";
export { physicsRenderBridge } from "./graphics/rendering/pbr-render/physics-bridge-plugin.js";
export { displayTransform } from "./graphics/rendering/display-transform-plugin.js";
export { interpolation } from "./graphics/rendering/interpolation-plugin.js";
export { modelCollider } from "./graphics/rendering/model-collider-plugin.js";
export { boneColliders } from "./graphics/rendering/bone-collider-plugin.js";
export { ragdollTrigger } from "./graphics/rendering/ragdoll-trigger-plugin.js";
export { joltRagdoll } from "./graphics/rendering/jolt-ragdoll-plugin.js";
export { fitBoneCapsules } from "./physics/ragdoll/fit-bone-capsules.js";
export type { BoneCapsule } from "./physics/ragdoll/fit-bone-capsules.js";
export { mesh } from "./graphics/scene/model/mesh-plugin.js";
export { shapeGeometry } from "./graphics/scene/model/shape/shape-geometry-plugin.js";
export type { ShapeSpec } from "./graphics/scene/model/shape/shape-spec.js";
export { VoxelShape } from "./voxel-shape/voxel-shape.js";
export { voxelShape, voxelShapeRender, voxelShapeVisualBridge } from "./voxel-shape/voxel-shape-plugin.js";
export { requireVoxelShape } from "./voxel-shape/require-voxel-shape.js";
export type { VoxelShapeByNameLookup } from "./voxel-shape/require-voxel-shape.js";

// --- Types (type + namespace, access .plugin for the ECS plugin) -------------
export { Camera } from "./graphics/camera/camera.js";
export { Light } from "./graphics/scene/light/light.js";
export { Orbit } from "./graphics/camera/orbit/orbit.js";
export { Node } from "./graphics/scene/node/node.js";
export { Model } from "./graphics/scene/model/model.js";
export { Mesh } from "./graphics/scene/model/mesh/mesh.js";
export { SceneUniforms } from "./graphics/scene/scene-uniforms/scene-uniforms.js";
export { StandardVertex } from "./graphics/rendering/standard-vertex/standard-vertex.js";
export { VisibleMaterial } from "./graphics/rendering/visible-material/visible-material.js";

// --- Utilities ---------------------------------------------------------------
export { attachOrbitDrag } from "./graphics/camera/orbit/attach-orbit-drag.js";
export type { OrbitDragService } from "./graphics/camera/orbit/attach-orbit-drag.js";
