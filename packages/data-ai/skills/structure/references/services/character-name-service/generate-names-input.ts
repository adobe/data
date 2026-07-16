import type { NameStyle } from "./name-style/name-style.js";

export type GenerateNamesInput = {
  readonly count: number;
  readonly style: NameStyle;
  readonly seed?: number;
};
