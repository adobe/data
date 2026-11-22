# ports

The library folder, through the File System Access API: `createLibraryAccess` makes the `LibraryAccess` views call. It
asks for a folder, keeps it in IndexedDB for the next visit, when the browser asks permission again, and lists its
`*.voxel.json` files, folders within it too. Opening reads a document with every file it references; saving writes only
the files whose text changed since they were read or written, so a referenced model's library file is written back once
it's edited, and asks for a path the first time.
