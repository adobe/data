import { Entity } from '@adobe/data/ecs';
import { useObservableValues } from '@adobe/data-react';
import { useDatabase } from './hooks/use-database';
import { useTexture } from './hooks/use-texture';
import { SPRITE_URLS } from './sprite-urls';

export function Sprite({ entity }: { entity: Entity }) {
    const db = useDatabase();
    const values = useObservableValues(
        () => ({
            sprite: db.observe.entity(entity, db.archetypes.Sprite)
        }),
        [entity],
    );

    const spriteType = values?.sprite?.sprite ?? 'bunny';
    const texture = useTexture( SPRITE_URLS[spriteType]);
    if (!values?.sprite) return null;
    const { sprite } = values;

    return (
        <pixiSprite
            anchor={0.5}
            eventMode={'static'}
            onClick={() => db.transactions.toggleSpriteActive({ entity })}
            onPointerOver={() => db.transactions.setSpriteHovered({ entity, hovered: true })}
            onPointerOut={() => db.transactions.setSpriteHovered({ entity, hovered: false })}
            scale={sprite.active ? 1.5 : sprite.hovered ? 1.25 : 1}
            texture={texture}
            x={sprite.position[0]}
            y={sprite.position[1]}
            rotation={sprite.rotation}
        />
    );
}
