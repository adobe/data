import { clampAlphaUnit } from "./clamp-alpha-unit.js";

const roundToPrecision = (value: number, precision: number): number =>
  Math.round(value * 10 ** precision) / 10 ** precision;

const snapNearBoundary = (value: number, epsilon = 1e-6): number =>
  value < epsilon ? 0 : value > 1 - epsilon ? 1 : value;

export const normalizeAlpha = (value: number): number =>
  snapNearBoundary(roundToPrecision(clampAlphaUnit(value), 4));
