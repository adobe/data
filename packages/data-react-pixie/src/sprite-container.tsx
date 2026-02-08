import { useObservableValues } from "@adobe/data-react";
import { useDatabase } from "./hooks/use-database";
import { getFiltersForType } from "./filters";
import { Sprite } from "./sprite";

export function SpriteContainer() {
    const db = useDatabase();
    const values = useObservableValues(() => ({
        sprites: db.observe.select(db.archetypes.Sprite.components),
        filterType: db.observe.resources.filterType,
    }), []);
    if (!values) return;

    const filters = getFiltersForType(values.filterType ?? "none");

    return (
        <pixiContainer filters={filters}>
            {values.sprites.map((entity) => (
                <Sprite key={entity} entity={entity} />
            ))}
        </pixiContainer>
    );
}