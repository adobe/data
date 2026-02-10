// © 2026 Adobe. MIT License. See /LICENSE for details.

import {
  createContext,
  useMemo,
  useContext,
  type ReactNode,
  type ReactElement,
} from "react";
import { Database } from "@adobe/data/ecs";

export const DatabaseContext = createContext<Database | null>(null);

export type DatabaseProviderProps<P extends Database.Plugin> = {
  plugin: P;
  database?: Database.FromPlugin<P>;
  children: ReactNode;
};

export function DatabaseProvider<P extends Database.Plugin>(
  props: DatabaseProviderProps<P>,
): ReactElement {
  const { plugin, database: providedDatabase, children } = props;
  const ancestor = useContext(DatabaseContext);

  const database = useMemo(() => {
    if (providedDatabase) {
      return providedDatabase;
    }
    if (ancestor) {
      return ancestor.extend(plugin) as unknown as Database.FromPlugin<P>;
    }
    return Database.create(plugin) as unknown as Database.FromPlugin<P>;
  }, [plugin, providedDatabase, ancestor]);

  return (
    <DatabaseContext.Provider value={database as unknown as Database}>
      {children}
    </DatabaseContext.Provider>
  );
}
