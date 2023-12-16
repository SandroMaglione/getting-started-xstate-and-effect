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