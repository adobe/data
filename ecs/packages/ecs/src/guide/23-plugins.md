# Plugins

A *plugin* is what an app adds to a world and removes as a unit: the `systems` it adds, and optionally a `connect`
that connects the world to what's outside it, such as an element's events, and returns what disconnects it.

- The values plugins connect with have names, declared by augmenting [`interface PluginConfig`](23-plugins.ts#L10-L13)
  as components and resources are declared. Plugins asking for one name share its declaration, so it means the same
  to each.
- A plugin names what it asks for in its type: [`clicking`](23-plugins.ts#L22-L29), a `Plugin<"surface">`, reads
  only `surface`, and [`reporting`](23-plugins.ts#L35), a `Plugin`, asks for nothing.
- [`Plugin.start(`](23-plugins.ts#L41) adds every plugin's systems as one composite, then connects each in order with
  one config, which must hold every name they ask for, once: leaving one out, or giving it another type, is a type
  error.
- What it returns is `Disposable`, so `using` stops the plugins at the end of its block: it disconnects them in
  reverse order, then removes their systems. A click once they're stopped counts nothing.
