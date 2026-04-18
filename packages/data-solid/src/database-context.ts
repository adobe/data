// © 2026 Adobe. MIT License. See /LICENSE for details.

import { createContext, useContext, type JSX } from "solid-js";
import { createComponent } from "solid-js/web";
import { Database } from "@adobe/data/ecs";

export const DatabaseContext = createContext<Database | null>(null);

export type DatabaseProviderProps<P extends Database.Plugin> = {
  plugin: P;
  database?: Database.FromPlugin<P>;
  children: JSX.Element;
};

export function DatabaseProvider<P extends Database.Plugin>(
  props: DatabaseProviderProps<P>,
): JSX.Element {
  const ancestor = useContext(DatabaseContext);
  const database = props.database
    ?? (ancestor
      ? ancestor.extend(props.plugin) as unknown as Database.FromPlugin<P>
      : Database.create(props.plugin) as unknown as Database.FromPlugin<P>);

  return createComponent(DatabaseContext.Provider, {
    value: database as unknown as Database,
    get children() { return props.children; },
  });
}
