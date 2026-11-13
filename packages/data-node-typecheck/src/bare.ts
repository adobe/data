// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Assert, Equal, Surface, SurfaceBlob } from "./common.js";

// Without a global Blob, a blob schema is `unknown`: it accepts any value but is never `any`.
type _Blob = Assert<Equal<SurfaceBlob, unknown>>;
type _Data = Assert<Equal<Surface["data"], unknown>>;
