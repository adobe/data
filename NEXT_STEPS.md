# Suggested next steps

Items we've parked while pursuing other work. Not in priority order;
priorities shift with what we just shipped.

## Tests

We've built a lot without test coverage: animation sampling, schema-
driven interpolator dispatch, skinning matrix math, glTF parsing
(skin, animations, vertex packing), the orbit-camera plugin's
auto-fit. Useful targets:

- `componentwiseLerp` — round-trips for Vec3, scalar, edge cases.
- `interpolate` — schema-declared interpolator dispatch (`Quat.slerp`
  picked over default lerp).
- `sampleTrack` — keyframe bracket binary search at boundaries and
  inside spans; step / linear modes.
- `parseGltfSkin` — joint-parent map for a glTF where joint order is
  not topological.
- `parseGltfAnimations` — channels targeting non-joint nodes are
  filtered out; jointIndex resolution.
- `pbrSkinningMatrixSystem` — `inverse(modelWorld) × jointWorld × IBM`
  produces identity at bind pose.

## Shadow mapping

Biggest visual upgrade still missing from the IBL renderer. Standard
shape:

1. Depth-only render pass from the light's POV → depth texture.
2. Fragment shader samples the shadow map with PCF.
3. New plugin `pbrShadow` (or extends `pbrIbl`) owns the depth pass,
   the shadow map texture/sampler resources, and the extra bind group.

Cascaded shadow maps for the directional light, omnidirectional cube
shadow maps for point lights — pick one first.

## Multi-clip animation blending

The animation player drives one clip. Real-world rigs blend walk→run
on a velocity parameter, or layer an upper-body action over a
locomotion base. Two reasonable extensions:

- **List of weighted clips on the player.** Tracks from each clip are
  sampled, then linearly combined per-target-component using the
  player's per-clip weight. Works for crossfades and additive layers.
- **Animation state machine.** Higher level: nodes are clips,
  transitions have durations and conditions. State machine is itself
  an entity component; a system advances it.

The first is a smaller step and unlocks crossfades.

## CubicSpline interpolation

The `interpolate` function throws on `cubicSpline`. glTF rarely uses
it but it's a real spec mode. Each keyframe stores
`[inTangent, value, outTangent]`; Hermite blend between adjacent
keyframes. Quaternion variant normalizes after the Hermite. Add an
`InterpolatorFn` signature that accepts the tangent data, register
it on `Quat.schema` for slerp-equivalent cubic.

## Asset URL deduplication

Two `insertGeometry({ pbrModelUrl: "fox.glb" })` calls fetch and
upload Fox twice. Add a `Map<url, geometryEntityId>` in the loader
closure: on `insertGeometry`, if the URL is already known and that
geometry is still alive, reuse the entity id instead of inserting a
new one. Watch for the case where the original was deleted.

## Skinned-mesh instancing

Today each skinned Model gets its own draw call with its own skeleton
bind group. For crowds this is the bottleneck. Pack all instances'
joint matrices into one storage buffer keyed by
`instance_index × jointCount + jointIdx`; the skinned vertex shader
indexes into it using its instance_index. One draw call for N
identical-rigged characters.

## Camera improvements

- Orthographic/perspective switching at the camera resource level
  (the type already has an `orthographic` lerp factor).
- `Camera.screenToWorldRay(x, y)` for picking.
- Pick-test plugin: cast a ray at click, return the first hit entity.

## Smaller items

- HDR tone mapping options (we hardcode ACES; Reinhard, Khronos
  Neutral are alternatives).
- Per-material `alphaMode: "BLEND"` proper handling — currently
  treated like OPAQUE.
- `setLight` accepts intensity scale separate from color.
- Move `useOrbitDragCamera` and `useOrbitCameraControl` out of samples
  into a shared place if a non-sample consumer wants them.
