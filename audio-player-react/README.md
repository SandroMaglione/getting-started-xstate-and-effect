# `XState + Effect・Audio Player`

Core dependencies:

```bash
pnpm install xstate @xstate/react effect @effect/schema
```

`tsconfig.json` additions:

```json
    "strictNullChecks": true,
    "exactOptionalPropertyTypes": true
```

## Notes
- Keep copy-pasting all machine from editor only to change a single state 
  - Great for copying states, while others params can stay the same (`types`, `actions`)
  - Maybe allow to copy only a specific parameter (e.g. **only states**)
  - **Note**: Editor for initial logic, then switching all on code for implementation
- `snapshot.matches` is untyped! (not always it seems, and the match is not always a `string` but it can also be an object for nested states)
- An `assign` action (`entry`) requires a sync operation
- Possibly fix the issue with `missing audioRef` by working with sub-machines and having a valid ref or error (probably not)
- Issues with `exactOptionalPropertyTypes` in `tsconfig.json` causes `matches` type to become `never` (possibly work on a reproduction)

```bash
Types of property '_out_TActor' are incompatible.

Type 'ProvidedActor' is not assignable to type '{ src: string; logic: UnknownActorLogic; id: string | undefined; }'.ts(2322)
```

- Issues with using `assign` in `setup` `actions` (expected?)
- How to keep machine implementation and editor in sync (should you)?