// © 2026 Adobe. MIT License. See /LICENSE for details.

// --- Core model plugins ---------------------------------------------------
// Persistent, user-authored data. The human's mental model of a renderable
// scene.
export { node } from "./graphics/node/node-plugin.js";
export { camera } from "./graphics/camera/camera-plugin.js";
export { light } from "./graphics/light/light-plugin.js";
export { model } from "./graphics/model/model-plugin.js";
export { scene } from "./graphics/scene-plugin.js";

// --- Authoring abstractions (model plugins) -------------------------------
// Higher-level intents that internal systems translate into core state.
export { orbit } from "./graphics/orbit/orbit-plugin.js";
export { animation } from "./graphics/animation/animation-plugin.js";
export { AnimationTrack } from "./graphics/animation/animation-track/animation-track.js";
export { InterpolationMode } from "./graphics/animation/interpolation-mode/interpolation-mode.js";

// --- Infrastructure -------------------------------------------------------
export { graphics } from "./graphics/graphics-plugin.js";

// --- Implementation system plugins (consumed via aggregators) -------------
export { transform } from "./graphics/node/transform-plugin.js";
export { sceneUniforms } from "./graphics/scene-uniforms/scene-uniforms-plugin.js";
export { pbrCore } from "./graphics/pbr/pbr-core-plugin.js";
export { modelLoader } from "./graphics/model/model-loader-plugin.js";
export { pbrSkinning } from "./graphics/pbr/skinning/skinning-plugin.js";

// --- Render aggregators ---------------------------------------------------
// User-facing single-include plugins that compose everything below into a
// working renderer. Pick exactly one.
export { pbrIblRender } from "./graphics/pbr/ibl-render/ibl-render-plugin.js";
export { pbrDirectRender } from "./graphics/pbr/direct-render/direct-render-plugin.js";

// --- Types ----------------------------------------------------------------
export { Camera } from "./graphics/camera/camera.js";
export { SceneUniforms } from "./graphics/scene-uniforms/scene-uniforms.js";
export { PositionColorNormalVertex } from "./graphics/vertices/position-color-normal/position-color-normal.js";
export { StandardVertex } from "./graphics/pbr/standard-vertex/standard-vertex.js";
export { VisibleMaterial } from "./graphics/pbr/visible-material/visible-material.js";
export { GPU } from "./graphics/gpu/gpu.js";
