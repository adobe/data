# model

The library: the folder of model files the editor loads from and saves to, which may hold folders of its own.
`library` holds its folder, whether it's ready or needs the user's permission again, its model files, `LibraryEntry`,
and what last went wrong; `setLibrary` records it. `LibraryAccess` is what reaches the folder, outside the world, given
to views by the `libraryAccess` plugin config name.
