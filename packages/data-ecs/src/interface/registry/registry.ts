/** `D` maps each key to the declaration its registration requires. */
export type Registry<D> = {
    /**
     * Registers a declaration under `key`, a plain `Symbol(...)`: its `type` schema and its other traits, fixed from
     * then on. The same declaration again, as a module evaluated again makes it, is accepted. Throws for a key that
     * isn't a plain symbol (a `Symbol.for` or well-known symbol isn't), one registered as another kind or with another
     * declaration, a trait that isn't registered, a trait's value that can't hold for the declaration, or a schema
     * asking for a GPU layout it can't meet.
     */
    readonly register: <K extends keyof D & symbol>(key: K, declaration: D[K]) => void;
};
