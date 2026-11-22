// © 2026 Adobe. MIT License. See /LICENSE for details.
import { drawThumbnail } from "./function.draw-thumbnail.js";
import type { ModelLook } from "./internal/type.model-look.js";

/** A model's thumbnail as a PNG data URL, `pixels` square, turned as the palette shows it at rest. */
export const thumbnailUrl = (look: ModelLook, pixels = 96): string => {
    const canvas = document.createElement("canvas");
    canvas.width = pixels;
    canvas.height = pixels;
    drawThumbnail(canvas, look, Math.PI / 5);
    return canvas.toDataURL("image/png");
};
