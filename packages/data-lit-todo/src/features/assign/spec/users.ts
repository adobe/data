// © 2026 Adobe. MIT License. See /LICENSE for details.
import { compare } from "@adobe/data/functions";
import type { User } from "../data/entities/user.js";
import type { State } from "./state.js";

// All users, sorted by name (code-point order).
export const users = (state: Pick<State, "users">): readonly User[] =>
  [...state.users.values()].sort((a, b) => compare(a.name, b.name));
