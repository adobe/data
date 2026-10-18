const objectBrand = Symbol("object");

/** The `type` of a value that isn't data: no schema describes it, so this states its type `T`. */
export type ObjectType<T> = { readonly [objectBrand]: (value: T) => T };

const identity = <T>(value: T): T => value;

/** The one `ObjectType` every declaration shares: its type is all it carries. */
const objectType = { [objectBrand]: identity };

/**
 * The `type` of a value that isn't data, such as a `Map`, a DOM node or a Transferable: `{ type: object<HTMLElement>() }`.
 * The world stores the value as it is.
 */
export const object = <T>(): ObjectType<T> => objectType;

/** Whether a declaration's `type` states an object's type rather than a schema. */
export const isObjectType = (type: unknown): type is AnyObjectType => typeof type === "object" && type !== null && objectBrand in type;

/** Any `ObjectType`, whatever type it states. */
export type AnyObjectType = { readonly [objectBrand]: (value: never) => unknown };
