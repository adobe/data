/**
 * A microbenchmark of reading a values object's symbol keys, as commands and spawns do: each round builds the
 * object literal a spawn site would, then reads every key and its value. Run with `node dist/perf/run.js --keys`
 * after `pnpm exec vite build --config vite.perf.config.ts`; it prints nanoseconds per object by method and key count.
 */

const keys: readonly symbol[] = Array.from({ length: 6 }, (_, k) => Symbol(`keys/${k}`));
const [k0, k1, k2, k3, k4, k5] = keys;

/** Each count's literal, so every object of a count has one shape, as one spawn site's do. */
const literals: readonly ((i: number) => object)[] = [
    i => ({ [k0]: i }),
    i => ({ [k0]: i, [k1]: i }),
    i => ({ [k0]: i, [k1]: i, [k2]: i }),
    i => ({ [k0]: i, [k1]: i, [k2]: i, [k3]: i }),
    i => ({ [k0]: i, [k1]: i, [k2]: i, [k3]: i, [k4]: i }),
    i => ({ [k0]: i, [k1]: i, [k2]: i, [k3]: i, [k4]: i, [k5]: i }),
];

/** Reads every symbol key and value; returns a sum so nothing is optimized away. */
type Method = (values: object) => number;

const methods: readonly (readonly [string, Method])[] = [
    // Building the literal alone, the cost every method includes.
    ["the literal alone", () => 0],
    ["Object.keys, then symbols", values => {
        let sum = 0;
        for (const key of Object.keys(values)) sum += Number(Reflect.get(values, key));
        for (const key of Object.getOwnPropertySymbols(values)) sum += Number(Reflect.get(values, key));
        return sum;
    }],
    ["Object.getOwnPropertySymbols", values => {
        let sum = 0;
        const found = Object.getOwnPropertySymbols(values);
        for (let k = 0; k < found.length; k++) sum += Number(Reflect.get(values, found[k]));
        return sum;
    }],
    // Not a way to read unknown keys: values read by keys known in advance, to separate listing keys from reading values.
    ["known keys, no listing", values => {
        let sum = 0;
        for (let k = 0; k < keys.length; k++) {
            const value: unknown = Reflect.get(values, keys[k]);
            if (value !== undefined) sum += Number(value);
        }
        return sum;
    }],
    ["Reflect.ownKeys, symbols only", values => {
        let sum = 0;
        const found = Reflect.ownKeys(values);
        for (let k = 0; k < found.length; k++) {
            const key = found[k];
            if (typeof key === "symbol") sum += Number(Reflect.get(values, key));
        }
        return sum;
    }],
];

const rounds = 1_000_000;

/** The fastest of several timed passes, in nanoseconds per object. */
const time = (method: Method, literal: (i: number) => object): number => {
    let best = Infinity;
    let sink = 0;
    for (let pass = 0; pass < 7; pass++) {
        const start = performance.now();
        for (let i = 0; i < rounds; i++) sink += method(literal(i));
        best = Math.min(best, performance.now() - start);
    }
    if (sink === -1) console.log(sink);
    return (best * 1e6) / rounds;
};

const names: readonly string[] = keys.map((_, k) => `keys/${k}`);
const [s0, s1, s2, s3, s4, s5] = names;

/** The same literals keyed by strings, for comparison with string keys read by `Object.keys`. */
const stringLiterals: readonly ((i: number) => object)[] = [
    i => ({ [s0]: i }),
    i => ({ [s0]: i, [s1]: i }),
    i => ({ [s0]: i, [s1]: i, [s2]: i }),
    i => ({ [s0]: i, [s1]: i, [s2]: i, [s3]: i }),
    i => ({ [s0]: i, [s1]: i, [s2]: i, [s3]: i, [s4]: i }),
    i => ({ [s0]: i, [s1]: i, [s2]: i, [s3]: i, [s4]: i, [s5]: i }),
];

const stringKeys: Method = values => {
    let sum = 0;
    const found = Object.keys(values);
    for (let k = 0; k < found.length; k++) sum += Number(Reflect.get(values, found[k]));
    return sum;
};

/** Prints one line per method: nanoseconds per object for 1 to 6 keys. */
export const runKeyReading = (): void => {
    console.log(["method".padEnd(32), ...literals.map((_, k) => `${k + 1} key${k === 0 ? "" : "s"}`.padStart(8))].join(""));
    for (const [name, method] of methods) {
        console.log([name.padEnd(32), ...literals.map(literal => `${time(method, literal).toFixed(1)}`.padStart(8))].join(""));
    }
    console.log(["string keys, Object.keys".padEnd(32), ...stringLiterals.map(literal => `${time(stringKeys, literal).toFixed(1)}`.padStart(8))].join(""));
};
