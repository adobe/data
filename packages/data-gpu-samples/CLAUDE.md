# CLAUDE.md — data-gpu-samples

## Never commit binary assets to this repo

Model files (`.glb`, `.gltf`, `.bin`), HDR environment maps, textures, and
audio belong on public CDNs, not in git. The repo's `.gitignore` excludes
`public/models/` and `public/env/`. Do not work around the ignore by
checking files in elsewhere or by adding them to a `dist/` folder.

The repo's git history has been rewritten once already to remove
accidentally-committed binaries; doing so again is expensive and error-
prone. Catch it before the commit.

## Where to source assets

When a sample needs a model or environment map, link to a public source
that hosts the file under a permissive license. Two reliable options:

- **glTF models** — Khronos Sample Assets repo, raw GitHub:
  ```
  https://raw.githubusercontent.com/KhronosGroup/glTF-Sample-Assets/main/Models/<Name>/glTF-Binary/<Name>.glb
  ```
  Examples already in use: `DamagedHelmet`, `MetalRoughSpheres`,
  `AntiqueCamera`, `Fox`. License: see the model's own `LICENSE.md` in
  the Khronos repo (most are CC-BY 4.0).

- **HDR environment maps** — Poly Haven:
  ```
  https://dl.polyhaven.org/file/ph-assets/HDRIs/hdr/1k/<name>.hdr
  ```
  Examples in use: `studio_small_09_1k`, `venice_sunset_1k`,
  `kloppenheim_02_1k`. License: CC0.

Use the `1k` HDR variant unless a sample is specifically showcasing
high-res IBL — `2k` and `4k` HDRs are megabytes of needless bandwidth
for a sample.

## Attribution

When a sample uses a third-party asset, add a one-line comment near
the asset URL crediting the source and license — e.g.
```ts
// Fox glTF © Khronos Group, CC-BY 4.0
const MODEL_URL = "https://raw.githubusercontent.com/.../Fox.glb";
```

## When a sample genuinely needs a custom asset

Get explicit permission from the engineer with acceptance of the size, file type and location.
