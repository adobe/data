// © 2026 Adobe. MIT License. See /LICENSE for details.

/** An item of `<menu-button>`: its action, `""` for a separator, its label, whether it can be chosen, and a shortcut to show. */
export type MenuItem = { readonly action: string; readonly label: string; readonly enabled: boolean; readonly hint?: string };
