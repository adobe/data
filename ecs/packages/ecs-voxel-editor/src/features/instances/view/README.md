# view

The path to the model being edited: `instancesView` finds `<edit-path>` within the app's root and writes the path to it
as editing changes, with each step's name and, where it's referenced, its library file; clicking a step leaves to it,
and "Copy locally" makes a referenced model the document's own.
