## New ECS Folder

### New Features Needed

ECS Core Database
- [x] components can have null value, deleting components is distinct from setting to null.
- [x] simplify and improve type definitions.
- [x] allow to define new components with separate schema and type declarations.
- [x] fix deserialization with constant columns.

ECS Transactional Database
- [x] .components
- [x] .resources
- [x] .archetypes
- [ ] selectEntityValues with optional filter
- [x] observations and actions on updates

ECS Action Database
- [-] applied actions are stored directly within the database.
- [x] logic to prune old applied actions after a certain point.
- [x] action sequences
