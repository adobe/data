import type { GenerateNamesInput } from "./generate-names-input.js";
import type { GeneratedName } from "./generated-name.js";
import type { NameStyle } from "./name-style/name-style.js";

const prefixes: Record<NameStyle, readonly string[]> = {
  fantasy: ["Ald", "Bran", "Cael", "Dorn", "Eira"],
  "sci-fi": ["Nova", "Vex", "Zyn", "Korr", "Luma"],
  modern: ["Alex", "Jordan", "Riley", "Morgan", "Casey"],
};

const suffixes: Record<NameStyle, readonly string[]> = {
  fantasy: ["wyn", "thor", "mere", "dell", "ric"],
  "sci-fi": ["-7", " Prime", " IX", " Unit", " Flux"],
  modern: [" Lee", " Kim", " Cruz", " Park", " Shaw"],
};

const nextIndex = (seed: number, index: number): number =>
  (seed * 1_103_515_245 + 12_345 + index * 97) % 2_147_483_647;

export const fakeGenerateNames = (input: GenerateNamesInput): readonly GeneratedName[] => {
  const seed = input.seed ?? 1;
  const count = Math.max(0, Math.min(input.count, 16));
  const stylePrefixes = prefixes[input.style];
  const styleSuffixes = suffixes[input.style];

  return Array.from({ length: count }, (_, index) => {
    const pick = nextIndex(seed, index);
    const prefix = stylePrefixes[pick % stylePrefixes.length] ?? stylePrefixes[0];
    const suffix = styleSuffixes[(pick >> 3) % styleSuffixes.length] ?? styleSuffixes[0];
    return { value: `${prefix}${suffix}`, style: input.style };
  });
};

export const fakeGenerateNameStream = async function* (
  input: GenerateNamesInput,
): AsyncGenerator<GeneratedName> {
  for (const name of fakeGenerateNames(input)) {
    yield name;
  }
};
