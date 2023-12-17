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
- `snapshot.matches` is untyped!
- An `assign` action (`entry`) requires a sync operation
- Possibly fix the issue with `missing audioRef` by working with sub-machines and having a valid ref or error