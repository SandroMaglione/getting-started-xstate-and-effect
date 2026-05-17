import { Effect } from "effect";
import {
  assign,
  fromCallback,
  fromPromise,
  setup,
  type ActorRefFrom,
} from "xstate";
import { AppSync } from "./app-sync";
import { Runtime } from "./runtime";
import { TodoApi } from "./todo-api";
import type { Todo, TodoStats } from "./types";

type CreateTodoEvent =
  | { readonly type: "title.changed"; readonly title: string }
  | { readonly type: "todo.create" };

type TodoListEvent = { readonly type: "todos.refresh" };
type TodoStatsEvent = { readonly type: "stats.refresh" };

export const syncCreateTodoMachine = setup({
  types: {
    context: {} as { title: string },
    events: {} as CreateTodoEvent,
  },
  actors: {
    createTodo: fromPromise(({ input }: { input: { title: string } }) =>
      Runtime.runPromise(
        Effect.gen(function* () {
          const todoApi = yield* TodoApi;

          yield* todoApi.create(input.title);

          const appSync = yield* AppSync;

          /// 👇 The writer publishes what changed, not who should refresh.
          yield* appSync.invalidate("todos");
        })
      )
    ),
  },
  actions: {
    assignTitle: assign((_, { title }: { title: string }) => ({ title })),
    clearTitle: assign({ title: "" }),
  },
}).createMachine({
  context: { title: "" },
  initial: "Idle",
  states: {
    Idle: {
      on: {
        "title.changed": {
          actions: {
            type: "assignTitle",
            params: ({ event }) => event,
          },
        },
        "todo.create": {
          guard: ({ context }) => context.title.trim().length > 0,
          target: "Creating",
        },
      },
    },
    Creating: {
      invoke: {
        src: "createTodo",
        input: ({ context }) => ({ title: context.title.trim() }),
        onDone: {
          target: "Idle",
          actions: "clearTitle",
        },
        onError: {
          target: "Idle",
        },
      },
    },
  },
});

export const syncTodoListMachine = setup({
  types: {
    context: {} as { todos: ReadonlyArray<Todo> },
    events: {} as TodoListEvent,
  },
  actors: {
    listenTodoInvalidations: fromCallback<TodoListEvent>(({ sendBack }) => {
      /// 👇 The list translates the shared topic into its own local event.
      const cancel = Runtime.runCallback(
        Effect.gen(function* () {
          const appSync = yield* AppSync;

          yield* appSync.listen("todos", () =>
            sendBack({ type: "todos.refresh" })
          );
        })
      );

      return () => {
        cancel();
      };
    }),
    fetchTodos: fromPromise(() =>
      Runtime.runPromise(TodoApi.use((api) => api.list))
    ),
  },
  actions: {
    assignTodos: assign((_, { todos }: { todos: ReadonlyArray<Todo> }) => ({
      todos,
    })),
  },
}).createMachine({
  context: { todos: [] },
  /// 👇 Listening is part of the list actor, so the actor can stay local.
  invoke: {
    src: "listenTodoInvalidations",
  },
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "fetchTodos",
        onDone: {
          target: "Ready",
          actions: {
            type: "assignTodos",
            params: ({ event }) => ({ todos: event.output }),
          },
        },
      },
      on: {
        "todos.refresh": {
          target: "Loading",
          reenter: true,
        },
      },
    },
    Ready: {
      on: {
        "todos.refresh": {
          target: "Loading",
        },
      },
    },
  },
});

export const syncTodoStatsMachine = setup({
  types: {
    context: {} as { stats: TodoStats },
    events: {} as TodoStatsEvent,
  },
  actors: {
    listenTodoInvalidations: fromCallback<TodoStatsEvent>(({ sendBack }) => {
      /// 👇 Stats listens to the same topic but keeps a different event name.
      const cancel = Runtime.runCallback(
        Effect.gen(function* () {
          const appSync = yield* AppSync;

          yield* appSync.listen("todos", () =>
            sendBack({ type: "stats.refresh" })
          );
        })
      );

      return () => {
        cancel();
      };
    }),
    fetchStats: fromPromise(() =>
      Runtime.runPromise(TodoApi.use((api) => api.stats))
    ),
  },
  actions: {
    assignStats: assign((_, { stats }: { stats: TodoStats }) => ({ stats })),
  },
}).createMachine({
  context: { stats: { total: 0, completed: 0, open: 0 } },
  /// 👇 No parent has to know that stats depends on todos.
  invoke: {
    src: "listenTodoInvalidations",
  },
  initial: "Loading",
  states: {
    Loading: {
      invoke: {
        src: "fetchStats",
        onDone: {
          target: "Ready",
          actions: {
            type: "assignStats",
            params: ({ event }) => ({ stats: event.output }),
          },
        },
      },
      on: {
        "stats.refresh": {
          target: "Loading",
          reenter: true,
        },
      },
    },
    Ready: {
      on: {
        "stats.refresh": {
          target: "Loading",
        },
      },
    },
  },
});

export type SyncCreateTodoActor = ActorRefFrom<typeof syncCreateTodoMachine>;
export type SyncTodoListActor = ActorRefFrom<typeof syncTodoListMachine>;
export type SyncTodoStatsActor = ActorRefFrom<typeof syncTodoStatsMachine>;
