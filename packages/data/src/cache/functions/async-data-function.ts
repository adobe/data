// © 2026 Adobe. MIT License. See /LICENSE for details.

export type AsyncDataFunction<InputArgs extends Array<unknown>, Output> = (
  ...args: InputArgs
) => Promise<Output>;
