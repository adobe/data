// © 2026 Adobe. MIT License. See /LICENSE for details.

type SystemDeclaration = {
    readonly create: (...args: any[]) => any;
    /**
     * Scheduling constraints for system execution order.
     * - `before`: Hard constraint - this system must run before the listed systems
     * - `after`: Hard constraint - this system must run after the listed systems
     * - `during`: Soft constraint - prefer to run in the same tier as the listed systems, if dependencies allow
     */
    readonly schedule?: {
        readonly before?: readonly string[];
        readonly after?: readonly string[];
        readonly during?: readonly string[];
    };
};

/**
 * Builds a dependency graph from system scheduling constraints.
 * Returns a map where each system maps to the set of systems that must run before it.
 */
const buildDependencyGraph = <S extends string>(
    systemNames: readonly S[],
    systems: { readonly [K in S]: SystemDeclaration }
): Map<S, Set<S>> => {
    const dependsOn = new Map<S, Set<S>>();
    
    // Initialize all systems with empty dependency sets
    for (const name of systemNames) {
        dependsOn.set(name, new Set());
    }
    
    // Process scheduling constraints
    for (const name of systemNames) {
        const schedule = systems[name].schedule;
        
        if (schedule?.after) {
            for (const dep of schedule.after) {
                dependsOn.get(name)!.add(dep as S);
            }
        }
        
        if (schedule?.before) {
            for (const dependent of schedule.before) {
                dependsOn.get(dependent as S)!.add(name);
            }
        }
    }
    
    return dependsOn;
};

/**
 * Detects cycles in the dependency graph using DFS.
 * @throws Error if a circular dependency is detected
 */
const detectCycles = <S extends string>(
    systemNames: readonly S[],
    dependsOn: Map<S, Set<S>>
): void => {
    const visited = new Set<S>();
    const stack = new Set<S>();
    
    const detectCycle = (node: S): boolean => {
        if (stack.has(node)) {
            return true;
        }
        if (visited.has(node)) {
            return false;
        }
        
        visited.add(node);
        stack.add(node);
        
        const deps = dependsOn.get(node)!;
        for (const dep of deps) {
            if (detectCycle(dep)) {
                return true;
            }
        }
        
        stack.delete(node);
        return false;
    };
    
    for (const name of systemNames) {
        if (detectCycle(name)) {
            throw new Error("Circular dependency detected in system scheduling");
        }
    }
};

/**
 * Builds tiers of systems using topological sort.
 * Systems in the same tier can run in parallel.
 */
const buildTiers = <S extends string>(
    systemNames: readonly S[],
    dependsOn: Map<S, Set<S>>
): S[][] => {
    const tiers: S[][] = [];
    const processed = new Set<S>();
    
    while (processed.size < systemNames.length) {
        const currentTier: S[] = [];
        
        for (const name of systemNames) {
            if (processed.has(name)) {
                continue;
            }
            
            // Check if all dependencies are processed
            const deps = dependsOn.get(name)!;
            const allDepsProcessed = Array.from(deps).every(dep => processed.has(dep));
            
            if (allDepsProcessed) {
                currentTier.push(name);
            }
        }
        
        if (currentTier.length === 0) {
            // Should never happen if cycle detection works
            throw new Error("Unable to resolve system dependencies");
        }
        
        // Sort tier alphabetically for deterministic output
        currentTier.sort();
        tiers.push(currentTier);
        
        for (const name of currentTier) {
            processed.add(name);
        }
    }
    
    return tiers;
};

/**
 * Finds which tier index contains the given system.
 * Returns -1 if not found.
 */
const findSystemTier = <S extends string>(
    tiers: readonly S[][],
    system: S
): number => {
    for (let i = 0; i < tiers.length; i++) {
        if (tiers[i].includes(system)) {
            return i;
        }
    }
    return -1;
};

/**
 * Checks if a system can be moved to a target tier without violating dependencies.
 */
const canMoveToTier = <S extends string>(
    system: S,
    targetTierIndex: number,
    tiers: readonly S[][],
    dependsOn: Map<S, Set<S>>
): boolean => {
    // Build reverse dependency map on-demand: systems that depend on this system
    const dependentsOf = new Set<S>();
    for (const [name, deps] of dependsOn.entries()) {
        if (deps.has(system)) {
            dependentsOf.add(name);
        }
    }
    
    // All dependencies must be in tiers strictly before target tier
    const deps = dependsOn.get(system)!;
    for (const dep of deps) {
        const depTier = findSystemTier(tiers, dep);
        if (depTier >= targetTierIndex) {
            return false;
        }
    }
    
    // All dependents must be in tiers strictly after target tier
    for (const dependent of dependentsOf) {
        const dependentTier = findSystemTier(tiers, dependent);
        if (dependentTier <= targetTierIndex) {
            return false;
        }
    }
    
    return true;
};

/**
 * Finds the best target tier for a system based on its "during" constraints.
 * Returns the tier index with the most targets, or -1 if no valid target found.
 */
const findBestTargetTier = <S extends string>(
    system: S,
    targets: readonly string[],
    tiers: readonly S[][]
): number => {
    let bestTierIndex = -1;
    let bestTargetCount = 0;
    
    for (const target of targets) {
        const targetTierIndex = findSystemTier(tiers, target as S);
        if (targetTierIndex === -1) {
            continue; // Target doesn't exist, skip
        }
        
        // Count how many targets are in this tier
        const targetCount = targets.filter(t => {
            const tier = findSystemTier(tiers, t as S);
            return tier !== -1 && tier === targetTierIndex;
        }).length;
        
        if (targetCount > bestTargetCount) {
            bestTargetCount = targetCount;
            bestTierIndex = targetTierIndex;
        }
    }
    
    return bestTierIndex;
};

/**
 * Optimizes tier placement for systems with "during" constraints.
 * Attempts to move systems to the same tier as their targets when dependencies allow.
 */
const optimizeDuringConstraints = <S extends string>(
    tiers: S[][],
    systemNames: readonly S[],
    systems: { readonly [K in S]: SystemDeclaration },
    dependsOn: Map<S, Set<S>>
): void => {
    // Collect systems with "during" constraints
    const systemsWithDuring: Array<{ system: S; targets: readonly string[] }> = [];
    for (const name of systemNames) {
        const schedule = systems[name].schedule;
        if (schedule?.during && schedule.during.length > 0) {
            systemsWithDuring.push({ system: name, targets: schedule.during });
        }
    }
    
    // Try to optimize placement for each system with "during" constraints
    for (const { system, targets } of systemsWithDuring) {
        const currentTierIndex = findSystemTier(tiers, system);
        const bestTierIndex = findBestTargetTier(system, targets, tiers);
        
        // If we found a valid target tier different from current, try to move
        if (bestTierIndex !== -1 && bestTierIndex !== currentTierIndex) {
            if (canMoveToTier(system, bestTierIndex, tiers, dependsOn)) {
                // Move system to target tier
                const currentTier = tiers[currentTierIndex];
                const targetTier = tiers[bestTierIndex];
                
                // Remove from current tier
                const index = currentTier.indexOf(system);
                if (index !== -1) {
                    currentTier.splice(index, 1);
                }
                
                // Add to target tier and maintain alphabetical order
                targetTier.push(system);
                targetTier.sort();
            }
        }
    }
};

/**
 * Calculates the execution order for systems based on their scheduling constraints.
 * Returns a 2D array where each sub-array represents a tier of systems that can
 * execute in parallel.
 * 
 * Hard constraints (before/after) are satisfied first, then soft constraints (during)
 * are applied to optimize tier placement when possible.
 * 
 * @param systems - Object mapping system names to their declarations
 * @returns Array of tiers, where each tier is an array of system names that can run in parallel
 * @throws Error if circular dependencies are detected
 */
export const calculateSystemOrder = <S extends string>(
    systems: { readonly [K in S]: SystemDeclaration }
): S[][] => {
    const systemNames = Object.keys(systems) as S[];
    
    if (systemNames.length === 0) {
        return [];
    }
    
    // Phase 1: Build dependency graph from hard constraints (before/after)
    const dependsOn = buildDependencyGraph(systemNames, systems);
    
    // Phase 2: Detect cycles
    detectCycles(systemNames, dependsOn);
    
    // Phase 3: Build tiers using topological sort
    const tiers = buildTiers(systemNames, dependsOn);
    
    // Phase 4: Optimize tier placement using soft constraints (during)
    optimizeDuringConstraints(tiers, systemNames, systems, dependsOn);
    
    // Filter out any empty tiers that may have been created during optimization
    return tiers.filter(tier => tier.length > 0);
};
