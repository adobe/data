
export type Comparison<T> = {
    readonly "=="?: T;
    readonly "!="?: T;
    readonly "<"?: T;
    readonly ">"?: T;
    readonly "<="?: T;
    readonly ">="?: T;
};

/** Row-level filter. A plain value means equality. */
export type Filter<T> = { readonly [K in keyof T]?: T[K] | Comparison<T[K]> };
