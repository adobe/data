// © 2026 Adobe. MIT License. See /LICENSE for details.
import type { ComponentLists } from '../../interface/system/access.js';

/** The components every entity a system's lists match has: what it reads, writes, has and filters on, but its optional ones. */
export const requiredOf = (lists: ComponentLists | undefined): readonly symbol[] => {
    if (lists === undefined) return [];
    const { optional } = lists;
    const all = new Set([...lists.read ?? [], ...lists.write ?? [], ...lists.has ?? [], ...lists.added ?? [], ...lists.changed ?? []]);
    return optional === undefined ? [...all] : [...all].filter(key => !optional.includes(key));
};
