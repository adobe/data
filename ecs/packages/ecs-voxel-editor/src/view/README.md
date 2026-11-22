# view

The app's foundation, what every feature's view uses of the page.

- `root` is the element the app is mounted in: a resource views find their elements within, and a `PluginConfig` name
  plugins listen on.
- `on` listens for one event type until stopped, and `all` stops several at once.
- `define` defines the elements a feature lists, by tag name, that aren't defined yet.
