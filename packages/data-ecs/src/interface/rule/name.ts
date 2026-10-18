/**
 * The label reports and errors give it, which needn't be unique: the value its constructor returns is its identity, so
 * separately written code can't collide by name. Namespacing it (`"physics/integrate"`) keeps labels short.
 */
export type Name = string;
