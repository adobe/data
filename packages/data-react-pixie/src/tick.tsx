import { useTick } from "@pixi/react";
import { useDatabase } from "./hooks/use-database";

export function Tick() {
    const db = useDatabase();
    useTick((ticker) => {
        db.transactions.tick(ticker.deltaTime);
    });
    return null;
}
