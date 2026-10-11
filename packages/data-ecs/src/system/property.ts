
export type Property<T, K extends PropertyKey> = T extends { readonly [P in K]?: infer V } ? V : undefined;

export type Listed<T, K extends PropertyKey> = Property<T, K> extends readonly (infer E)[] ? E : never;
