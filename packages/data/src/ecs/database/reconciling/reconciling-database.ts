// © 2026 Adobe. MIT License. See /LICENSE for details.

import { TransactionResult } from "../transactional-store/index.js";
import { StringKeyof } from "../../../types/types.js";
import { Components } from "../../store/components.js";
import { ArchetypeComponents } from "../../store/archetype-components.js";
import type { TransactionDeclarations } from "../../store/transaction-functions.js";
import { ResourceComponents } from "../../store/resource-components.js";
import { ObservedDatabase } from "../observed/observed-database.js";
import type { Database } from "../database.js";
import { FromSchemas } from "../../../schema/from-schemas.js";

export type TransactionEnvelope<Name extends string = string> = {
    readonly id: number;
    readonly name: Name;
    readonly args: unknown;
    /**
     * Negative time indicates a transient application, positive time a committed one,
     * and zero time cancels any existing entry.
     */
    readonly time: number;
};

export interface ReconcilingDatabase<
    C extends Components,
    R extends ResourceComponents,
    A extends ArchetypeComponents<StringKeyof<C>>,
    TD extends TransactionDeclarations<C, R, A>,
> extends Omit<ObservedDatabase<C, R, A>, "extend"> {
    readonly apply: (envelope: TransactionEnvelope<Extract<keyof TD, string>>) => TransactionResult<C> | undefined;
    readonly cancel: (id: number) => void;
    readonly extend: <
        P extends Database.Plugin<any, any, any, any, any>
    >(
        plugin: P,
    ) => ReconcilingDatabase<
        C & (P extends Database.Plugin<infer XC, infer XR, infer XA, infer XTD, any> ? FromSchemas<XC> : never),
        R & (P extends Database.Plugin<infer XC, infer XR, infer XA, infer XTD, any> ? FromSchemas<XR> : never),
        A & (P extends Database.Plugin<infer XC, infer XR, infer XA, infer XTD, any> ? XA : never),
        TD & (P extends Database.Plugin<infer XC, infer XR, infer XA, infer XTD, any> ? XTD : never)
    >;
}

