/** Rounds to the nearest integer, and halfway values to the even one, as WGSL's `round` does. */
export const roundHalfEven = (x: number): number => {
    const rounded = Math.round(x);
    return rounded - x === 0.5 && Math.floor(rounded * 0.5) * 2 !== rounded ? rounded - 1 : rounded;
};
