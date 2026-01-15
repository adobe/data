// © 2026 Adobe. MIT License. See /LICENSE for details.

import { Archetype, ArchetypeId, ReadonlyArchetype } from "../../archetype/index.js";
import { Components } from "../../store/components.js";
import { ResourceComponents } from "../../store/resource-components.js";
import { ArchetypeComponents } from "../../store/archetype-components.js";
import { StringKeyof } from "../../../types/types.js";
import { ReadonlyStore, Store } from "../../store/index.js";
import { Observe } from "../../../observe/index.js";
import { TransactionResult } from "../transactional-store/index.js";
import { RequiredComponents } from "../../required-components.js";
import { Entity } from "../../entity.js";
import { EntityReadValues } from "../../store/core/index.js";
import { Database } from "../database.js";
import { FromSchemas } from "../../../schema/from-schemas.js";
export interface ObservedDatabase<
    C extends Components,
    R extends ResourceComponents,
    A extends ArchetypeComponents<StringKeyof<C>>
> extends ReadonlyStore<C, R, A> {
    readonly resources: { readonly [K in StringKeyof<R>]: R[K] };
    readonly observe: {
        readonly components: { readonly [K in StringKeyof<C>]: Observe<void> };
        readonly resources: { readonly [K in StringKeyof<R>]: Observe<R[K]> };
        readonly transactions: Observe<TransactionResult<C>>;
        entity<T extends RequiredComponents>(id: Entity, minArchetype?: ReadonlyArchetype<T> | Archetype<T>): Observe<{ readonly [K in (StringKeyof<RequiredComponents & T>)]: (RequiredComponents & T)[K] } & EntityReadValues<C> | null>;
        entity(id: Entity): Observe<EntityReadValues<C> | null>;
        archetype(id: ArchetypeId): Observe<void>;
        select<
            Include extends StringKeyof<C>,
            T extends Include
        >(
            include: readonly Include[] | ReadonlySet<string>,
            options?: any
        ): Observe<readonly Entity[]>;
    };
    readonly execute: (handler: (db: Store<C, R, A>) => Entity | void, options?: { transient?: boolean }) => TransactionResult<C>;
    readonly toData: () => unknown;
    readonly fromData: (data: unknown) => void;
    readonly extend: <
        P extends Database.Plugin<any, any, any, any, any>
    >(
        plugin: P,
    ) => ObservedDatabase<
        C & (P extends Database.Plugin<infer XC, infer XR, infer XA, infer XTD, any> ? FromSchemas<XC> : never),
        R & (P extends Database.Plugin<infer XC, infer XR, infer XA, infer XTD, any> ? FromSchemas<XR> : never),
        A & (P extends Database.Plugin<infer XC, infer XR, infer XA, infer XTD, any> ? XA : never)
    >;
}


