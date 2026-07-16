import * as components from "../components/index.js";
import { Kilo } from "./kilo.js";

export const Lima = [...Kilo, "charlie"] as const satisfies Array<keyof typeof components>;
