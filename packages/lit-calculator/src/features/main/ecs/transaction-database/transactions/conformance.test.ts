// © 2026 Adobe. MIT License. See /LICENSE for details.
//
// Conformance: every ECS transaction must produce the same logical `State` as
// the `data/` spec transform it wraps. The calculator's whole state is the
// single `calculator` resource, which *is* a `State`, so the comparison is
// exact — no projection is needed.
import { describe, it, expect } from "vitest";
import { Database } from "@adobe/data/ecs";
import { Digit } from "../../../data/digit/digit.js";
import { Operation } from "../../../data/operation/operation.js";
import { State } from "../../../data/state/state.js";
import { TransactionDatabase } from "../transaction-database.js";

// A single step: dispatch the ecs transaction and, in lockstep, apply the pure
// `data/` transform it stands for. Members are never spelled at the call site —
// digits and operations are drawn from the type's own `values` descriptor.
type Step = {
  readonly dispatch: (db: TransactionDatabase) => void;
  readonly apply: (state: State) => State;
};

const inputDigit = (digit: Digit): Step => ({
  dispatch: (db) => db.transactions.inputDigit(digit),
  apply: (state) => State.inputDigit(state, digit),
});
const inputDecimal = (): Step => ({
  dispatch: (db) => db.transactions.inputDecimal(),
  apply: (state) => State.inputDecimal(state),
});
const setOperation = (operation: Operation): Step => ({
  dispatch: (db) => db.transactions.setOperation(operation),
  apply: (state) => State.setOperation(state, operation),
});
const evaluate = (): Step => ({
  dispatch: (db) => db.transactions.evaluate(),
  apply: (state) => State.evaluate(state),
});
const clear = (): Step => ({
  dispatch: (db) => db.transactions.clear(),
  apply: () => State.clear(),
});

// Run the steps against a live database, asserting after every step that the
// `calculator` resource equals folding the pure transforms over the spec State.
const runLockstep = (steps: readonly Step[]) => {
  const db = Database.create(TransactionDatabase.plugin);
  let spec = db.resources.calculator;
  for (const step of steps) {
    step.dispatch(db);
    spec = step.apply(spec);
    expect(db.resources.calculator).toEqual(spec);
  }
};

describe("ECS transactions conform to the data/ State spec", () => {
  it("inputDigit matches State.inputDigit for every digit (overwrite then append)", () => {
    for (const digit of Digit.values) {
      runLockstep([inputDigit(digit), inputDigit(digit)]);
    }
  });

  it("inputDecimal matches State.inputDecimal (fresh entry, append, idempotent)", () => {
    const [first] = Digit.values;
    runLockstep([inputDecimal(), inputDigit(first), inputDecimal(), inputDecimal()]);
  });

  it("setOperation matches State.setOperation for every operation", () => {
    const [first] = Digit.values;
    for (const operation of Operation.values) {
      runLockstep([inputDigit(first), setOperation(operation)]);
    }
  });

  it("evaluate matches State.evaluate for a full expression per operation", () => {
    const left = Digit.values[8];
    const right = Digit.values[2];
    for (const operation of Operation.values) {
      runLockstep([inputDigit(left), setOperation(operation), inputDigit(right), evaluate()]);
    }
  });

  it("evaluate is a no-op with nothing armed, matching the spec", () => {
    const seven = Digit.values[7];
    runLockstep([inputDigit(seven), evaluate()]);
  });

  it("clear matches State.clear after activity", () => {
    const left = Digit.values[9];
    const [firstOp] = Operation.values;
    runLockstep([inputDigit(left), setOperation(firstOp), inputDecimal(), clear()]);
  });

  it("matches the spec across a chained mixed sequence", () => {
    const two = Digit.values[2];
    const three = Digit.values[3];
    const four = Digit.values[4];
    const [add] = Operation.values;
    runLockstep([
      inputDigit(two),
      setOperation(add),
      inputDigit(three),
      evaluate(),
      setOperation(add),
      inputDigit(four),
      evaluate(),
    ]);
  });
});
