// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * An item of `<palette-panel>`: its key and label; a material's CSS `color`, a model's `draw`, drawing its thumbnail on a
 * canvas turned to an angle, with a `version` that changes as it does, or a library file's saved `image`; the `folder`
 * of a library file; and whether it's selected and a favorite.
 */
export type PaletteItem = {
    readonly key: string;
    readonly label: string;
    readonly color?: string;
    readonly draw?: (canvas: HTMLCanvasElement, angle: number) => void;
    readonly version?: number;
    readonly image?: string;
    readonly folder?: string;
    readonly selected: boolean;
    readonly favorite: boolean;
};
