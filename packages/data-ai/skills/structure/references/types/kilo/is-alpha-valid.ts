export const isAlphaValid = (value: number): boolean =>
  Number.isFinite(value) && value >= 0 && value <= 1;
