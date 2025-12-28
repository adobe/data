/*MIT License

© Copyright 2025 Adobe. All rights reserved.

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.*/

import type { Database, SystemFunction } from "./database.js";
import type { ComponentSchemas } from "../component-schemas.js";
import type { ResourceSchemas } from "../resource-schemas.js";
import type { ArchetypeComponents } from "../store/archetype-components.js";
import type { ActionDeclarations, ToActionFunctions } from "../store/action-functions.js";
import type { FromSchemas } from "../../schema/index.js";
import type { StringKeyof, Simplify, NoInfer } from "../../types/types.js";
import { combinePlugins } from "./combine-plugins.js";

type RemoveIndex<T> = Simplify<{
    [K in keyof T as
      string extends K ? never :
      number extends K ? never :
      symbol extends K ? never :
      K
    ]: T[K]
  }>;

export function createPlugin<
    const CS extends ComponentSchemas,
    const RS extends ResourceSchemas,
    const A extends ArchetypeComponents<StringKeyof<RemoveIndex<CS> & CSX>>,
    const TD extends ActionDeclarations<FromSchemas<RemoveIndex<CS> & CSX>, FromSchemas<RemoveIndex<RS> & RSX>, RemoveIndex<A>>,
    const S extends string = never,
    const CSX extends ComponentSchemas = {},
    const RSX extends ResourceSchemas = {},
    const AX extends ArchetypeComponents<StringKeyof<CSX>> = {},
    const TDX extends ActionDeclarations<FromSchemas<CSX>, FromSchemas<RSX>, AX> = {},
    const SX extends string = never,
>(
    plugins: {
        components?: CS,
        resources?: RS,
        archetypes?: A,
        transactions?: TD,
        systems?: { readonly [K in S]: {
            readonly create: (db: Database<
                FromSchemas<RemoveIndex<CS> & CSX>,
                FromSchemas<RemoveIndex<RS> & RSX>,
                RemoveIndex<A> & AX,
                ToActionFunctions<RemoveIndex<TD> & TDX>,
                string
            >) => SystemFunction;
            readonly schedule?: {
                readonly before?: readonly NoInfer<Exclude<S | SX, K>>[];
                readonly after?: readonly NoInfer<Exclude<S | SX, K>>[];
                readonly during?: readonly NoInfer<Exclude<S | SX, K>>[];
            }
            }
        }
        extends?: Database.Plugin<CSX, RSX, AX, TDX, SX>
    },
): Database.Plugin<
    Simplify<RemoveIndex<CS> & CSX>,
    Simplify<RemoveIndex<RS> & RSX>,
    Simplify<RemoveIndex<A> & AX>,
    Simplify<RemoveIndex<TD> & TDX>, S | SX>
{
    // Normalize plugins descriptor to a plugin object
    const plugin: any = {
        components: plugins.components ?? {},
        resources: plugins.resources ?? {},
        archetypes: plugins.archetypes ?? {},
        transactions: plugins.transactions ?? {},
        systems: plugins.systems ?? {},
    };

    if (plugins.extends) {
        return combinePlugins(plugins.extends, plugin) as any;
    }
    return plugin as any;
}

