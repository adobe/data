// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Why a material can't be named `wanted` among the document's other materials' names, null where it can: a blank name,
 * one taken, or one differing from a name taken only in case, as names are case-sensitive.
 */
export const nameProblem = (wanted: string, others: readonly string[]): string | null => {
    if (wanted === "") return "A material needs a name.";
    for (const existing of others) {
        if (existing === wanted) return `There's already a material "${wanted}".`;
        if (existing.toLowerCase() === wanted.toLowerCase()) return `"${wanted}" differs from the material "${existing}" only in case.`;
    }
    return null;
};
