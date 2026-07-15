// © 2026 Adobe. MIT License. See /LICENSE for details.

/** One block emitted by Volume.iterateBlocks. */
export interface BlockSpan {
    /** World coordinate of local voxel (0, 0, 0). */
    readonly origin: readonly [number, number, number];
    /** Extent along each axis. */
    readonly size: readonly [number, number, number];
    /** Buffer index of local (0, 0, 0). */
    readonly offset: number;
}
