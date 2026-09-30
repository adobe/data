// © 2026 Adobe. MIT License. See /LICENSE for details.

type Module = { readonly args?: unknown; readonly cases: readonly object[] };

// Append each no-op state to every system's cases as an ordinary case expecting no
// change, so both runners check it without a separate path.
export const withNoOp = (
  cases: object,
  noOp: readonly { readonly name: string; readonly before: object; readonly args?: unknown }[] | undefined,
): object => {
  if (noOp === undefined || noOp.length === 0) return cases;
  // Runtime invariant: a systems manifest's `cases` holds one case module per system.
  const modules = cases as Readonly<Record<string, Module>>;
  return Object.fromEntries(
    Object.entries(modules).map(([name, module]) => [
      name,
      { ...module, cases: [...module.cases, ...noOp.map((c) => ({ ...c, name: `${c.name} (no-op)`, after: {} }))] },
    ]),
  );
};
