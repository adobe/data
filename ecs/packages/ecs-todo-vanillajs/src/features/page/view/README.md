# view

What every feature's view uses of the page: events and elements.

- `attach` records on an element the entity it shows, where the element is made, and `entityOf` and
  `entityOfElement` find that entity from an event or an element, for the event's run.
- `on` listens for one event type until stopped, and `all` stops several at once.
- `define` defines the elements a feature lists, by tag name, that aren't defined yet.
