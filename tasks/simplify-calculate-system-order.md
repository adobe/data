# Simplify calculateSystemOrder Epic

**Status**: 📋 PLANNED  
**Goal**: Refactor `calculateSystemOrder` to be simpler, more maintainable, and easier to understand while preserving all functionality.

## Overview

The current `calculateSystemOrder` implementation is overly complex with 274 lines of nested logic, mutation-heavy operations, and intricate tier index management. The two-phase approach (hard constraints then soft constraints) creates unnecessary complexity, especially in the "during" optimization phase which involves building reverse dependency maps, moving systems between tiers, handling empty tier cleanup, and updating tier indices. This refactoring will extract helper functions, simplify the "during" optimization logic, eliminate complex index management, and make the code more functional and testable.

---

## Extract Helper Functions

Break down the monolithic function into smaller, focused helper functions with clear responsibilities.

**Requirements**:
- Given the dependency graph building logic, should extract to `buildDependencyGraph` helper function
- Given the cycle detection logic, should extract to `detectCycles` helper function  
- Given the tier building logic, should extract to `buildTiers` helper function
- Given the "during" optimization logic, should extract to `optimizeDuringConstraints` helper function
- Given helper functions, should maintain the same public API and behavior

---

## Simplify During Optimization

Refactor the "during" constraint optimization to be simpler and more straightforward, eliminating complex tier index management.

**Requirements**:
- Given systems with "during" constraints, should optimize placement without complex index tracking
- Given tier movements, should avoid manual tier index updates after removals
- Given empty tiers, should filter them at the end rather than removing and updating indices
- Given the optimization phase, should use simpler validation logic that's easier to understand
- Given the refactored code, should maintain all existing test cases passing

---

## Improve Code Organization

Reorganize the code structure to be more readable and maintainable with better separation of concerns.

**Requirements**:
- Given the main function, should have clear phases separated by comments or function calls
- Given helper functions, should be pure functions where possible (no side effects)
- Given data structures, should prefer immutable operations over mutations where practical
- Given the algorithm, should have clear variable names that express intent
- Given complex logic, should add inline comments explaining the "why" not just the "what"

---

## Simplify Empty Tier Handling

Eliminate the complex empty tier removal and index update logic by using a simpler approach.

**Requirements**:
- Given empty tiers created during optimization, should filter them at the end rather than removing mid-process
- Given tier filtering, should not require updating system-to-tier mappings
- Given the final result, should return only non-empty tiers
- Given the simplification, should maintain correct system ordering

