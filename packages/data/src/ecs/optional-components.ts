// © 2026 Adobe. MIT License. See /LICENSE for details.
export type OptionalComponents = {
    nonPersistent: true;
    // Marks an entity as local to this client — never replicated to peers.
    // Orthogonal to `nonPersistent` (durability): together they place an entity
    // in one of four quadrants, each backed by its own entity-id space
    // (see entity/persistence-sharing).
    nonShared: true;
};
