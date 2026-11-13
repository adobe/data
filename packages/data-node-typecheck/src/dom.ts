// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Schema } from "@adobe/data/schema";
import type { Assert, Equal, Surface, SurfaceBlob } from "./common.js";

type _Blob = Assert<Equal<SurfaceBlob, Blob>>;
type _Data = Assert<Equal<Surface["data"], Blob | undefined>>;
type _Element = Assert<Equal<Schema.ToType<{ typeName: "HTMLElement" }>, HTMLElement>>;

export const withBlob: Surface = { id: "a", version: 1, data: new Blob([]) };
// @ts-expect-error data must be a Blob
export const wrongBlob: Surface = { id: "a", version: 1, data: "not a blob" };
