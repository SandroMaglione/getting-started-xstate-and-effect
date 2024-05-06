import { emit, setup, type ActorRefFrom } from "xstate";

/// 1️⃣ Define "child" machine that handles a specific feature (e.g. upload file)
export const uploadMachine = setup({
  types: {
    /// 👇 Define events emitted by the machine
    emitted: {} as { type: "uploaded"; value: number },
    events: {} as { type: "upload"; value: number },
  },
  actions: {
    /// 👇 Send out events using `emit`
    upload: emit((_, { value }: { value: number }) => ({
      type: "uploaded" as const,
      value,
    })),
  },
}).createMachine({
  id: "child",
  initial: "Idle",
  states: {
    Idle: {
      on: {
        upload: {
          actions: {
            type: "upload",
            params: ({ event }) => event,
          },
        },
      },
    },
  },
});

export const rootMachine = setup({
  types: {
    context: {} as { child: ActorRefFrom<typeof uploadMachine> },
  },
}).createMachine({
  context: ({ spawn }) => ({
    /// 👇 In the "parent" machine spawn an instance of "child"
    child: spawn(uploadMachine),
  }),
});
