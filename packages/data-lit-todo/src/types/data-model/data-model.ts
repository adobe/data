// © 2026 Adobe. MIT License. See /LICENSE for details.

type Todo = {
  readonly id: number;
  readonly name: string;
  readonly complete: boolean;
};

export type DataModel = {
  readonly todos: readonly Todo[];
  readonly displayCompleted: boolean;
};

export * as DataModel from "./public.js";
