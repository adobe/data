// © 2026 Adobe. MIT License. See /LICENSE for details.

import { selectRows } from "../../../table/select-rows.js";
import { StringKeyof } from "../../../types/types.js";
import { RequiredComponents } from "../../required-components.js";
import { Entity } from "../../entity.js";
import { EntitySelectOptions } from "../entity-select-options.js";
import { Core } from "./core.js";
import { OptionalComponents } from "../../optional-components.js";

export const selectEntities = <
    C extends object,
    Include extends StringKeyof<C & OptionalComponents>
>(
    core: Core<C>,
    include: readonly Include[] | ReadonlySet<string>,
    options?: EntitySelectOptions<C & RequiredComponents, Pick<C & RequiredComponents & OptionalComponents, Include>>
): readonly Entity[] => {
    const archetypes = core.queryArchetypes(include, options as any);
    let length = 0;
    for (const archetype of archetypes) {
        length += archetype.rowCount;
    }
    if (!options?.where && !options?.order) {
        // when there is no where filter or order we have a fast path
        // that just uses the id column as a typed array.
        const entities = new Array<Entity>(length);
        let index = 0;
        for (const archetype of archetypes) {
            const idTypedArray = archetype.columns.id.getTypedArray();
            for (let i = 0; i < archetype.rowCount; i++) {
                entities[index++] = idTypedArray[i];
            }
        }
        return entities;
    }
    if (options?.where && !options.order) {
        const entities = new Array<Entity>();
        for (const archetype of archetypes) {
            const idTypedArray = archetype.columns.id.getTypedArray();
            for (const row of selectRows<Pick<C & RequiredComponents & OptionalComponents, Include>>(archetype as any, options.where)) {
                entities.push(idTypedArray[row]);
            }
        }
        return entities;
    }

    // now we know there is an order, there might be a where
    // ordering means we are going to want to extract the order values into an array that also contains id
    const entityValues = new Array<RequiredComponents & { [K in Include]: any }>();
    for (const archetype of archetypes) {
        const idTypedArray = archetype.columns.id.getTypedArray();
        for (const row of selectRows<Pick<C & RequiredComponents & OptionalComponents, Include>>(archetype as any, options.where)) {
            const entityValue = { id: idTypedArray[row] } as any;
            for (const order in options.order!) {
                entityValue[order] = archetype.columns[order]!.get(row);
            }
            entityValues.push(entityValue);
        }
    }
    // now that we have the entity values with the order values, we can sort the entity values
    entityValues.sort((a, b) => {
        for (const order in options.order!) {
            if (a[order] !== b[order]) {
                const comparison = a[order] - b[order];
                const ascending = options.order[order];
                return ascending ? comparison : -comparison;
            }
        }
        return 0;
    });
    return entityValues.map(entityValue => entityValue.id);
}