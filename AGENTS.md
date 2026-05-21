# AGENTS.md

## Reference Repositories

This repository includes squashed git subtrees under `.repos/` for AI agent reference.
Use them to inspect upstream implementation details, APIs, tests, examples, and migration
patterns while working in this project.

- `.repos/effect-v3`: Effect v3 reference from `https://github.com/Effect-TS/effect`
- `.repos/effect-v4`: Effect v4 / Effect Smol reference from `https://github.com/Effect-TS/effect-smol`
- `.repos/effect-xstate`: Effect XState integration reference from `https://github.com/typeonce-dev/effect-xstate`
- `.repos/xstate`: XState reference from `https://github.com/statelyai/xstate`

Treat these folders as vendored references. Do not edit code inside `.repos/` unless the
task explicitly asks to update or refresh the subtree contents.

## Agent Guidance

- Prefer project-local code and examples first, then consult `.repos/` when upstream
  behavior or API shape is unclear.
- When comparing Effect versions, check both `.repos/effect-v3` and `.repos/effect-v4`
  before recommending migration or compatibility changes.
- When working with state machines, actors, or XState integration patterns, consult
  `.repos/xstate` for current upstream conventions.
- When working with Effect and XState integration patterns together, consult
  `.repos/effect-xstate` for current upstream conventions.
- Keep application changes outside `.repos/` unless the requested work is specifically
  about maintaining the reference subtrees.
