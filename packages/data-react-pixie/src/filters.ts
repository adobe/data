import { BlurFilter, ColorMatrixFilter } from "pixi.js";
import type { FilterType } from "./pixie-plugin.js";

const blurFilter = new BlurFilter({ strength: 2, quality: 2 });
const sepiaFilter = new ColorMatrixFilter();
sepiaFilter.sepia(false);
const vintageFilter = new ColorMatrixFilter();
vintageFilter.vintage(false);
const nightFilter = new ColorMatrixFilter();
nightFilter.night(0.3, false);

const filterMap: Record<FilterType, import("pixi.js").Filter[]> = {
  none: [],
  sepia: [sepiaFilter],
  blur: [blurFilter],
  vintage: [vintageFilter],
  night: [nightFilter],
};

export function getFiltersForType(filterType: FilterType) {
  return filterMap[filterType];
}
