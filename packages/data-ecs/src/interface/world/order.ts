
/** Sort order by component, `true` for ascending. */
export type Order<T> = { readonly [K in keyof T]?: boolean };
