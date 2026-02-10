// © 2026 Adobe. MIT License. See /LICENSE for details.

/**
 * Edge representing a dependency relationship from one node to another.
 * [from, to] means "from" must come before "to" in the sorted order.
 */
export type Edge<T = unknown> = readonly [from: T, to: T];

/**
 * Performs topological sort on a directed acyclic graph.
 * 
 * @param nodes - Array of node identifiers to sort
 * @param edges - Array of dependency edges [from, to] where 'from' must come before 'to'
 * @returns Array of nodes in topologically sorted order
 * @throws Error if circular dependency is detected
 * 
 * @example
 * ```typescript
 * const nodes = ["a", "b", "c"];
 * const edges: Edge<string>[] = [["a", "b"], ["b", "c"]]; // a → b → c
 * const sorted = topologicalSort(nodes, edges); // ["a", "b", "c"]
 * 
 * // Works with numbers too
 * const numNodes = [1, 2, 3];
 * const numEdges: Edge<number>[] = [[1, 2], [2, 3]];
 * const numSorted = topologicalSort(numNodes, numEdges); // [1, 2, 3]
 * ```
 */
export const topologicalSort = <T>(nodes: readonly T[], edges: readonly Edge<T>[]): T[] => {
    const visited = new Set<T>();
    const visiting = new Set<T>();
    const sorted: T[] = [];
    
    // Build adjacency list for efficient dependency lookup
    const dependencies = new Map<T, T[]>();
    for (const [from, to] of edges) {
        if (nodes.includes(from) && nodes.includes(to)) {
            const deps = dependencies.get(to) ?? [];
            deps.push(from);
            dependencies.set(to, deps);
        }
    }
    
    const visit = (node: T): void => {
        if (visiting.has(node)) {
            throw new Error(`Circular dependency detected involving node: ${String(node)}`);
        }
        if (visited.has(node)) return;
        
        visiting.add(node);
        
        // Visit all dependencies first
        const deps = dependencies.get(node) ?? [];
        for (const dep of deps) {
            if (nodes.includes(dep)) {
                visit(dep);
            }
        }
        
        visiting.delete(node);
        visited.add(node);
        sorted.push(node);
    };
    
    // Visit all nodes
    for (const node of nodes) {
        visit(node);
    }
    
    return sorted;
};
