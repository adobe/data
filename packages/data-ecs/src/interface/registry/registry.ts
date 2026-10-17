/** `D` maps each name to the declaration its registration requires. */
export type Registry<D> = {
    /**
     * Registers a declaration: its `type` schema and its other traits, fixed from then on. The same declaration again,
     * as a module evaluated again makes it, is accepted. Throws if the name is declared otherwise, a trait isn't
     * registered, a trait's value can't hold for the declaration, or the schema asks for a GPU layout it can't meet.
     */
    readonly register: <K extends keyof D & (string | symbol)>(name: K, declaration: D[K]) => void;
};
