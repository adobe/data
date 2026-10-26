// © 2026 Adobe. MIT License. See /LICENSE for details.
/**
 * Structural derivation: which components an archetype's entities have once rules and `within` are applied.
 * Datalog with stratified negation over the components each entity has. A rule adds the components it derives where
 * its query matches; a component declared within a host stays only while the host is present. Each stratum is a least
 * fixed point, evaluated after every stratum it depends on, so the result is a pure function of the archetype.
 */

/** A rule as component ids. */
export type RuleFacts = { readonly has: readonly number[]; readonly not: readonly number[]; readonly derives: readonly number[] };

/** Strata in evaluation order: the rules deriving into each, with only that stratum's components, and its `within` dependents. */
export type Strata = readonly {
    readonly rules: readonly { readonly has: readonly number[]; readonly not: readonly number[]; readonly derives: readonly number[] }[];
    readonly within: readonly { readonly dependent: number; readonly host: number }[];
}[];

type Edge = { readonly to: number; readonly negative: boolean; readonly within: boolean };

/**
 * Orders rules and `within` declarations into strata. Throws for a cycle through a negation, which could oscillate,
 * and for a cycle through `within`. `hosts[id]` is the host of a component declared within one, or -1.
 */
export const strataOf = (rules: readonly RuleFacts[], hosts: readonly number[], nameOf: (id: number) => string): Strata => {
    const edges = new Map<number, Edge[]>();
    const nodes = new Set<number>();
    const edge = (from: number, to: number, negative: boolean, within: boolean): void => {
        nodes.add(from);
        nodes.add(to);
        let list = edges.get(from);
        if (list === undefined) edges.set(from, list = []);
        list.push({ to, negative, within });
    };
    for (const rule of rules) {
        for (const derived of rule.derives) {
            for (const id of rule.has) edge(id, derived, false, false);
            for (const id of rule.not) edge(id, derived, true, false);
            nodes.add(derived);
        }
    }
    hosts.forEach((host, dependent) => { if (host >= 0) edge(host, dependent, false, true); });
    // Tarjan's algorithm: each component is emitted after every component it reaches, so dependents come out first.
    const index = new Map<number, number>();
    const low = new Map<number, number>();
    const stack: number[] = [];
    const onStack = new Set<number>();
    const components: number[][] = [];
    let counter = 0;
    const visit = (node: number): void => {
        index.set(node, counter);
        low.set(node, counter);
        counter++;
        stack.push(node);
        onStack.add(node);
        for (const { to } of edges.get(node) ?? []) {
            if (!index.has(to)) {
                visit(to);
                low.set(node, Math.min(low.get(node) ?? 0, low.get(to) ?? 0));
            }
            else if (onStack.has(to)) low.set(node, Math.min(low.get(node) ?? 0, index.get(to) ?? 0));
        }
        if (low.get(node) !== index.get(node)) return;
        const component: number[] = [];
        for (;;) {
            const member = stack.pop();
            if (member === undefined) break;
            onStack.delete(member);
            component.push(member);
            if (member === node) break;
        }
        components.push(component);
    };
    for (const node of nodes) if (!index.has(node)) visit(node);
    components.reverse();
    return components.map(members => {
        const inside = new Set(members);
        for (const member of members) {
            for (const { to, negative, within } of edges.get(member) ?? []) {
                if (!inside.has(to)) continue;
                const cycle = members.map(nameOf).sort().join(", ");
                if (negative) throw new Error(`Rules derive in a cycle through a negation, which could oscillate: ${cycle}.`);
                if (within) throw new Error(`Components are within each other in a cycle: ${cycle}.`);
            }
        }
        return {
            rules: rules.flatMap(rule => {
                const derives = rule.derives.filter(id => inside.has(id));
                return derives.length === 0 ? [] : [{ has: rule.has, not: rule.not, derives }];
            }),
            within: members.flatMap(dependent => (hosts[dependent] ?? -1) >= 0 ? [{ dependent, host: hosts[dependent] ?? -1 }] : []),
        };
    });
};

