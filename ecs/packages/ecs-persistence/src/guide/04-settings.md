# Documents and settings

An application saves to more than one place, each with a trait of its own: [`file`](04-settings.ts#L5-L8) for what a
document holds, its voxels, their materials and its size, and `settings` for the user's own choices, the tool,
whether a panel is open and how far the view orbits, which never go into a document. A key carries the trait of each place it's saved in, under the
name it has there, and a name only has to be unique among the keys one trait covers.

- **Taking each:** [`snapshot({ world, by: file })`](04-settings.ts#L59) takes the document, and
  [`snapshot({ world, by: settings })`](04-settings.ts#L61) the settings: the tool and the panel, which are resources,
  and the view, an entity whose [`camera` and `orbit`](04-settings.ts#L26-L27) the settings cover.
- **Kept apart:** `decode` reads bytes by the trait it's given, and
  [refuses a name](04-settings.ts#L67-L70) the trait doesn't cover, so settings can't be loaded as a document, nor a
  document as settings.
- **Loading each:** `spawn` takes no trait: a snapshot holds the one it was taken or read by. A document opened in
  another world leaves that world's settings as they are.
- **A setting on an entity the application makes:** the view is made at startup, by
  [`startView`](04-settings.ts#L37), before the settings load, so loading them mustn't spawn a second one.
  [`spawn` with `match: [byCamera]` and `update: true`](04-settings.ts#L86) finds the view by its camera, a unique
  index's key, and writes the saved orbit onto it, as `commands.add` would; with `match` alone, the view would keep the
  orbit it started with.
