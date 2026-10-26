// © 2026 Adobe. MIT License. See /LICENSE for details.
import { System, World } from "../index.js";

const explode = System.create(() => {
    throw new Error("boom");
});

export const main = async (): Promise<void> => {
    await using world = World.create();
    await world.run(explode).catch((error: unknown) => console.log(String(error)));
};
