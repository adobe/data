// © 2026 Adobe. MIT License. See /LICENSE for details.

// Assert that invoking `run` throws (synchronously or via a rejected promise).
// `expected: true` accepts any thrown error; a string narrows to one whose
// `message` contains it as a substring. Shared by every runner that supports a
// `throws` case (`runSpec`, `runTransactions`, `runActions`) so sync and async
// transforms are asserted identically — `await` a sync throw the same as a
// rejection, since the throw happens before the `await` inside the `try`.
export const expectThrows = async (run: () => unknown, expected: true | string): Promise<void> => {
  let didThrow = false;
  let thrown: unknown;
  try {
    await run();
  } catch (e) {
    didThrow = true;
    thrown = e;
  }
  if (!didThrow) {
    const suffix = typeof expected === "string" ? ` containing "${expected}"` : "";
    throw new Error(`expected a throw${suffix}, but none was thrown`);
  }
  if (typeof expected === "string") {
    const message = thrown instanceof Error ? thrown.message : String(thrown);
    if (!message.includes(expected)) {
      throw new Error(`expected thrown error message to include "${expected}", got: ${JSON.stringify(message)}`);
    }
  }
};
