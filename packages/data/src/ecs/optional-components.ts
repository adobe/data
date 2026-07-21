// © 2026 Adobe. MIT License. See /LICENSE for details.
export type OptionalComponents = {
    nonPersistent: true;
    // Marks an entity as local to this client — never replicated to peers.
    // Declared for modelling; the database does not yet act on it (no separate
    // id space or sync exclusion). Orthogonal to `nonPersistent` (durability).
    nonShared: true;
};
