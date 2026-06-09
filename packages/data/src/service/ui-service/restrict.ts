// © 2026 Adobe. MIT License. See /LICENSE for details.

import type { Service } from "../service.js";
import type { FromService } from "./from-service.js";

/**
 * Narrows a full service/database to its UI-restricted view (see
 * {@link FromService}): transactions and other mutators become fire-and-forget
 * `void`, while `observe` surfaces pass through. The restriction is **purely
 * type-level** — the value returned is the very same instance — so this is the
 * single sanctioned boundary between the full transactional surface (used by
 * controllers / bootstrap containers) and the surface UI widgets consume.
 *
 * `T` is always assignable to `FromService<T>` by construction, but TypeScript
 * cannot prove it for a generic `T` (the `IsValid<T>` conditional inside
 * `FromService` stays deferred). Rather than reach for a cast, we declare the
 * precise mapped return as an overload and broaden the *implementation*
 * signature to `Service` — the identity body then type-checks with no cast.
 */
export function restrict<T extends Service>(service: T): FromService<T>;
export function restrict(service: Service): Service {
    return service;
}
