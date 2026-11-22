// © 2026 Adobe. MIT License. See /LICENSE for details.

/** Where a pointer is over the view: `x` and `y` from -1 to 1, left to right and bottom to top, of a view `aspect` times as wide as it's tall. */
export type Pointer = { readonly x: number; readonly y: number; readonly aspect: number };
