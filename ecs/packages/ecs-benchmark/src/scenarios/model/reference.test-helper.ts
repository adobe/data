// © 2026 Adobe. MIT License. See /LICENSE for details.
// The suite's components, entity factories and systems written plainly, in mutable objects, as its C++ is, to check the
// model computes what they do.

/** `random_xoshiro128`, its state updated in place. */
export type Generator = { state: [number, number, number, number] };

export const generator = (seed: number): Generator => ({ state: [(seed + 3) >>> 0, (seed + 5) >>> 0, (seed + 7) >>> 0, (seed + 11) >>> 0] });

const rotateLeft = (x: number, k: number): number => ((x << k) | (x >>> (32 - k))) >>> 0;

export const next = (rng: Generator): number => {
    const s = rng.state;
    const result = Math.imul(rotateLeft(Math.imul(s[1], 5) >>> 0, 7), 9) >>> 0;
    const t = (s[1] << 9) >>> 0;
    s[2] = (s[2] ^ s[0]) >>> 0;
    s[3] = (s[3] ^ s[1]) >>> 0;
    s[1] = (s[1] ^ s[2]) >>> 0;
    s[0] = (s[0] ^ s[3]) >>> 0;
    s[2] = (s[2] ^ t) >>> 0;
    s[3] = rotateLeft(s[3], 11);
    return result;
};

export const range = (rng: Generator, low: number, high: number): number => (next(rng) % (high - low + 1)) + low;

export type Position = { x: number; y: number };
export type Data = { thingy: number; dingy: number; mingy: boolean; seed: number; rng: Generator; numgy: number };
export type Player = { rng: Generator; type: number };
export type Health = { hp: number; maxhp: number; status: number };
export type Damage = { atk: number; def: number };
export type Sprite = { character: number };

/** An entity's components, each present or not. */
export type Reference = {
    position?: Position;
    velocity?: Position;
    data?: Data;
    player?: Player;
    health?: Health;
    damage?: Damage;
    sprite?: Sprite;
};

const npc = 0, monster = 1, hero = 2;
const spawn = 0, dead = 1, alive = 2;

const newData = (): Data => {
    const rng = generator(340383);
    return { thingy: 0, dingy: 0, mingy: false, seed: 340383, rng, numgy: next(rng) };
};

/** `EntityFactory::create`. */
const create = (): Reference => ({ position: { x: 0, y: 0 }, velocity: { x: 1, y: 1 }, data: newData() });

/** `addComponents` then `initComponents`, the player's generator seeded with `seed`. */
const addHeroMonster = (entity: Reference, seed: number, type: number | null): void => {
    const player: Player = { rng: generator(seed), type: npc };
    const health: Health = { hp: 0, maxhp: 0, status: spawn };
    const damage: Damage = { atk: 0, def: 0 };
    entity.position ??= { x: 0, y: 0 };
    const rate = range(player.rng, 1, 100);
    player.type = type ?? (rate <= 3 ? npc : rate <= 30 ? hero : monster);
    if (player.type === hero) {
        health.maxhp = range(player.rng, 5, 15);
        damage.def = range(player.rng, 2, 6);
        damage.atk = range(player.rng, 4, 10);
    }
    else if (player.type === monster) {
        health.maxhp = range(player.rng, 4, 12);
        damage.def = range(player.rng, 2, 8);
        damage.atk = range(player.rng, 3, 9);
    }
    else {
        health.maxhp = range(player.rng, 6, 12);
        damage.def = range(player.rng, 3, 8);
        damage.atk = 0;
    }
    entity.position.x = Math.fround(range(player.rng, 0, 420) - 100);
    entity.position.y = Math.fround(range(player.rng, 0, 340) - 100);
    Object.assign(entity, { player, health, damage, sprite: { character: 95 } });
};

/** `BM_SystemsUpdate`'s entities. */
export const updateEntities = (count: number, seedOf: (i: number) => number): Reference[] =>
    Array.from({ length: count }, (_, i) => {
        const entity = create();
        addHeroMonster(entity, seedOf(i), null);
        return entity;
    });

/** `BM_SystemsUpdateMixedEntities`'s entities. */
export const mixedUpdateEntities = (count: number, seedOf: (i: number) => number): Reference[] => {
    const entities: Reference[] = [];
    for (let i = 0, j = 0; i < count; i++) {
        const entity = create();
        entities.push(entity);
        if (count < 100 || (i >= Math.floor(2 * count / 4) && i <= Math.floor(3 * count / 4))) {
            if (count < 100 || j % 10 === 0) {
                if (i % 7 === 0) delete entity.position;
                if (i % 11 === 0) delete entity.velocity;
                if (i % 13 === 0) delete entity.data;
            }
            j++;
        }
    }
    for (let i = 0, j = 0; i < entities.length; i++) {
        const entity = entities[i];
        if (entity === undefined) continue;
        if ((count < 100 && i === 0) || count >= 100 || i >= Math.floor(count / 8)) {
            if ((count < 100 && i === 0) || count >= 100 || j % 2 === 0) {
                if (i === 0) addHeroMonster(entity, seedOf(i), hero);
                else if (i % 6 === 0) addHeroMonster(entity, seedOf(i), null);
                else if (i % 4 === 0) addHeroMonster(entity, seedOf(i), hero);
                else if (i % 2 === 0) addHeroMonster(entity, seedOf(i), monster);
            }
            j++;
        }
    }
    return entities;
};

const dt = Math.fround(1 / 60);

/** One frame of `Application::update`, its two basic systems or all seven, drawing each character at its cell. */
export const update = (entities: readonly Reference[], complex: boolean, draw: (cell: number, character: number) => void): void => {
    for (const { position, velocity } of entities) {
        if (position === undefined || velocity === undefined) continue;
        position.x = Math.fround(position.x + Math.fround(velocity.x * dt));
        position.y = Math.fround(position.y + Math.fround(velocity.y * dt));
    }
    for (const { data } of entities) {
        if (data === undefined) continue;
        data.thingy = (data.thingy + 1) % 1000000;
        data.dingy += 0.0001 * dt;
        data.mingy = !data.mingy;
        data.numgy = next(data.rng);
    }
    if (!complex) return;
    for (const { position, velocity, data } of entities) {
        if (position === undefined || velocity === undefined || data === undefined || data.thingy % 10 !== 0) continue;
        if (position.x > position.y) {
            velocity.x = range(data.rng, 3, 19) - 10;
            velocity.y = range(data.rng, 0, 5);
        }
        else {
            velocity.x = range(data.rng, 0, 5);
            velocity.y = range(data.rng, 3, 19) - 10;
        }
    }
    for (const { health } of entities) {
        if (health === undefined) continue;
        if (health.hp <= 0 && health.status !== dead) {
            health.hp = 0;
            health.status = dead;
        }
        else if (health.status === dead && health.hp === 0) {
            health.hp = health.maxhp;
            health.status = spawn;
        }
        else if (health.hp >= health.maxhp && health.status !== alive) {
            health.hp = health.maxhp;
            health.status = alive;
        }
        else health.status = alive;
    }
    for (const { health, damage } of entities) {
        if (health === undefined || damage === undefined) continue;
        const total = damage.atk - damage.def;
        if (health.hp > 0 && total > 0) health.hp = Math.max(health.hp - total, 0);
    }
    for (const { sprite, player, health } of entities) {
        if (sprite === undefined || player === undefined || health === undefined) continue;
        if (health.status === alive) sprite.character = player.type === hero ? 64 : player.type === monster ? 107 : player.type === npc ? 104 : 32;
        else sprite.character = health.status === dead ? 124 : health.status === spawn ? 95 : 32;
    }
    for (const { position, sprite } of entities) {
        if (position === undefined || sprite === undefined) continue;
        const x = Math.trunc(position.x), y = Math.trunc(position.y);
        if (y >= 0 && y < 240 && x >= 0 && x < 320) draw(x + y * 320, sprite.character);
    }
};
