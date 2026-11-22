# elements

`<edit-path>`: the path to the model being edited, its earlier steps buttons dispatching `edit-path-leave`, and, where
the model edited is referenced from the library, which file edits go to, with a button dispatching `edit-path-local`.
It knows nothing of the ECS.
