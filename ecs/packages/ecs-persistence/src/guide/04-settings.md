# Documents and settings

An application saves to more than one place, each with a trait of its own: [`file`](04-settings.ts#L5-L8) for what a
document holds, its voxels, their materials and its size, and `settings` for the user's own choices, the tool and
whether a panel is open, which never go into a document. A key carries the trait of each place it's saved in, under the
name it has there, and a name only has to be unique among the keys one trait covers.

- **Taking each:** [`snapshot({ world, by: file })`](04-settings.ts#L46) takes the document, and
  [`snapshot({ world, by: settings })`](04-settings.ts#L48) the settings. The settings
  [are resources alone](04-settings.ts#L26-L27), so their snapshot holds no entity.
- **Kept apart:** `decode` reads bytes by the trait it's given, and
  [refuses a name](04-settings.ts#L53-L57) the trait doesn't cover, so settings can't be loaded as a document, nor a
  document as settings.
- **Loading each:** `spawn` takes no trait: a snapshot holds the one it was taken or read by. A document opened in
  another world leaves that world's settings as they are.
