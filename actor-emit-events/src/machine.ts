import { assign, emit, sendTo, setup, type ActorRefFrom } from "xstate";

const systemIds = ["upload", "notifier"] as const;
type SystemIds = (typeof systemIds)[number];

type NotifierEvents = { type: "notify"; value: number };

export type ActorIds = "upload-machine" | "notifier-machine";

/**
 * Receptionist pattern 🪄
 *
 * https://stately.ai/blog/announcing-xstate-v5-beta#actor-system
 */
export const notifierMachine = setup({
  types: {
    context: {} as { lastValue: number | null },
    events: {} as NotifierEvents,
  },
  actions: {
    notify: assign((_, { value }: { value: number }) => ({ lastValue: value })),
  },
}).createMachine({
  initial: "Idle",
  context: { lastValue: null },
  states: {
    Idle: {
      on: {
        notify: {
          actions: {
            type: "notify",
            params: ({ event }) => event,
          },
        },
      },
    },
  },
});

/// 1️⃣ Define "child" machine that handles a specific feature (e.g. upload file)
export const uploadMachine = setup({
  types: {
    context: {} as { value: string },
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
    notify: sendTo(
      ({ system }) => system.get<SystemIds>("notifier"),
      (_, { value }: { value: number }) =>
        ({
          type: "notify",
          value,
        } satisfies NotifierEvents)
    ),
  },
}).createMachine({
  id: "child",
  initial: "Idle",
  context: { value: "XState 🔥" },
  states: {
    Idle: {
      on: {
        upload: {
          actions: [
            {
              type: "upload",
              params: ({ event }) => event,
            },
            {
              type: "notify",
              params: ({ event }) => event,
            },
          ],
        },
      },
    },
  },
});

export const rootMachine = setup({
  types: {
    context: {} as { child: ActorRefFrom<typeof uploadMachine> },
  },
  actors: {
    upload: uploadMachine,
    notifier: notifierMachine,
  },
}).createMachine({
  invoke: [
    {
      src: "upload",
      id: "upload-machine" satisfies ActorIds,
      systemId: "upload" satisfies SystemIds,
    },
    {
      src: "notifier",
      id: "notifier-machine" satisfies ActorIds,
      systemId: "notifier" satisfies SystemIds,
    },
  ],
  context: ({ spawn }) => ({
    /// 👇 In the "parent" machine spawn an instance of "child"
    child: spawn(uploadMachine),
  }),
});
