/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

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

