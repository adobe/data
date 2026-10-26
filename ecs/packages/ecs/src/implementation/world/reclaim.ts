// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { Layout } from '../../interface/registry/layout.js';
import { bump, noShared, release, type Archetype, type Edge } from './archetype.js';
import { createArrivals, membershipWord } from './arrivals.js';
import { forgetTexts } from './layout-directory.js';
import { holdShared, releaseShared, sweepShared } from './shared.js';
import type { State } from './state.js';

// Reclaiming archetypes of shared values (design.md, "Reclaiming"): one found empty at a sync point is reclaimed once
// it stayed empty for `emptyFor` sync points and every joined thread finalized past it. Reclaimed, it leaves the
// world's lookup by key and systems' match lists, lets go of its arrays and of each value only it held, and the edges
// cached to and from it are cleared. It waits in its component set's pool, under its id, until an archetype of those
// components and other values is wanted: then it's reused for them, its id and storages kept, so what's cached by id of
// its components stays true, and everything that read its values reads them again.

/**
 * Sync points an archetype stays empty before it's reclaimed, so one emptied and filled again soon, as a cell is while
 * entities cross it, isn't reclaimed and reused over and over: a reclaim and reuse costs a sync point about 1.7 µs
 * (perf.md), and each walker leaves at most this many empty behind it. A tail ends before the second sync point after
 * the one it reads, so none reads a reclaimed archetype's rows.
 */
export const emptyFor = 8;

/** The component set an archetype's pool is found by: its components, whatever its values. */
const poolKeyOf = (components: readonly number[]): string => components.join(",");

/** The membership log's length past which it's trimmed by half: a reader further behind reads every archetype again. */
const membershipLog = 4096;

/** Notes a change of archetype's membership, reclaimed or reused, for systems' match lists and joined threads. */
const noteMembership = (state: State, archetype: Archetype): void => {
    const { membership } = state;
    membership.log.push(archetype);
    state.reshapes++;
    if (membership.log.length > membershipLog) {
        const dropped = membership.log.length >> 1;
        membership.log.splice(0, dropped);
        membership.base += dropped;
    }
    if (state.memory.shared) {
        const ring = state.arrivalRing ??= createArrivals(state.memory);
        Atomics.add(ring.control, membershipWord, 1);
    }
};

/** Archetypes whose rows left in the sync point just applied that are now empty, with shared values, as candidates. */
export const noteEmptied = (state: State): void => {
    const { plan, archetypes } = state;
    for (let entry = 0; entry < plan.count; entry++) {
        const from = plan.from[entry];
        if (from < 0) continue;
        const archetype = archetypes[from];
        if (archetype.shared === noShared || archetype.emptiedAt >= 0 || archetype.count !== 0 || archetype.reclaimed) continue;
        archetype.emptiedAt = state.syncs;
        archetype.emptiedTick = state.tick;
        state.emptied.push(archetype);
    }
};

/**
 * Whether every joined thread acknowledged its stop lists through the sync point of `tick`, an archetype's last with
 * rows: a stop list names its stops' archetypes, whose values the thread reads by id as it finalizes them.
 */
const stopsSettledThrough = (state: State, tick: number): boolean => {
    for (const channel of state.channels) {
        for (const block of channel.stops.written) if (((block.sync - (tick >>> 0)) | 0) <= 0 && !block.acknowledged) return false;
    }
    return true;
};

/**
 * At the end of a sync point: reclaims the candidates that stayed empty long enough, keeps those that may be later,
 * drops those filled again, then drops the values interned since the last sync point that nothing came to hold.
 */
export const reclaimEmptied = (state: State): void => {
    const { emptied } = state;
    let kept = 0;
    for (let k = 0; k < emptied.length; k++) {
        const archetype = emptied[k];
        if (archetype.reclaimed) continue;
        if (archetype.count > 0) {
            archetype.emptiedAt = -1;
            continue;
        }
        // An archetype holding a joined thread's objects is kept: its rows' moves are in that thread's log, by its id.
        if (state.syncs - archetype.emptiedAt < emptyFor || archetype.logs !== null || !stopsSettledThrough(state, archetype.emptiedTick)) {
            emptied[kept++] = archetype;
            continue;
        }
        reclaim(state, archetype);
    }
    emptied.length = kept;
    for (const values of state.sharedList) if (values.fresh.length > 0) sweepShared(values);
};

/** Clears each edge cached to or from an archetype, removing it from the other end's. */
const clearEdges = (archetype: Archetype): void => {
    const { edges } = archetype;
    if (edges === null) return;
    archetype.edges = null;
    for (const edge of edges) {
        if (Reflect.get(edge.holder, edge.key) !== undefined) Reflect.set(edge.holder, edge.key, edge.cleared);
        for (const end of edge.ends) {
            if (end === archetype || end.edges === null) continue;
            const at = end.edges.indexOf(edge);
            if (at >= 0) end.edges.splice(at, 1);
        }
    }
};

/**
 * Notes an edge `holder[key]` cached between archetypes `from` and `to`, so it's cleared, set to `cleared`, once either
 * is reclaimed. Only edges with an end of shared values are kept, so worlds without them keep none.
 */
export const noteEdge = (holder: object, key: PropertyKey, cleared: unknown, from: Archetype, to: Archetype): void => {
    const toShared = to !== from && to.shared !== noShared;
    if (from.shared === noShared && !toShared) return;
    const ends = from.shared === noShared ? [to] : toShared ? [from, to] : [from];
    const edge: Edge = { holder, key, cleared, ends };
    for (const end of ends) (end.edges ??= []).push(edge);
};

const reclaim = (state: State, archetype: Archetype): void => {
    archetype.reclaimed = true;
    archetype.emptiedAt = -1;
    state.archetypeByKey.delete(archetype.key);
    clearEdges(archetype);
    archetype.adding.length = archetype.removing.length = archetype.sharing.length = 0;
    release(state.memory, archetype);
    state.gpu?.forget(archetype);
    const pool = state.pools.get(poolKeyOf(archetype.components));
    if (pool === undefined) state.pools.set(poolKeyOf(archetype.components), [archetype]);
    else pool.push(archetype);
    for (const id of archetype.components) {
        const number = archetype.shared[id];
        const values = state.shared[id];
        if (number !== undefined && values !== undefined) releaseShared(values, number);
    }
    // Listed, so the record is written flagged; its version moved on as its arrays went.
    bump(archetype);
    noteMembership(state, archetype);
};

/**
 * A reclaimed archetype of `components` reused for the shared values `held` holds, their layouts and texts by
 * component id; null where its component set's pool is empty.
 */
export const reuseArchetype = (state: State, key: string, components: readonly number[], held: readonly (number | undefined)[], layouts: readonly (Layout | undefined)[], texts: readonly (string | undefined)[]): Archetype | null => {
    const archetype = state.pools.get(poolKeyOf(components))?.pop();
    if (archetype === undefined) return null;
    archetype.reclaimed = false;
    archetype.generation++;
    archetype.key = key;
    archetype.shared = held.length === 0 ? noShared : held;
    archetype.texts = texts;
    for (const storage of archetype.storages) {
        const layout = layouts[storage.component];
        if (layout !== undefined) storage.layout = layout;
    }
    for (const id of components) {
        const number = held[id];
        const values = state.shared[id];
        if (number !== undefined && values !== undefined) holdShared(values, number);
    }
    if (state.directory !== null) forgetTexts(state.directory, archetype);
    // Its values changed: what read them by its version reads them again, and the directory writes its record.
    bump(archetype);
    noteMembership(state, archetype);
    return archetype;
};
