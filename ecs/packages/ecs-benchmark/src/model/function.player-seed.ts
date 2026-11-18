// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * The seed of the `i`th player's generator. The suite seeds a default-constructed generator from its address; this
 * spreads seeds over 32 bits as addresses are, the same on every run.
 */
export const playerSeed = (i: number): number => Math.imul(i + 1, 0x9E3779B9) >>> 0;
