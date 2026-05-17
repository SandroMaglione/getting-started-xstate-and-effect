import { Effect } from "effect";
import {
  assign,
  fromPromise,
  sendParent,
  sendTo,
  setup,
  type ActorRefFrom,
} from "xstate";
import { Runtime } from "./runtime";
import { TodoApi } from "./todo-api";
import type { Todo, TodoStats } from "./types";

type CreateTodoEvent =
  | { readonly type: "title.changed"; readonly title: string }
  | { readonly type: "todo.create" };

type TodoCreatedEvent = { readonly type: "todo.created" };

type TodoListEvent = { readonly type: "todos.refresh" };
type TodoStatsEvent = { readonly type: "stats.refresh" };

export const refCreateTodoMachine = setup({
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
          /// 👇 The child reports up, so refresh coordination moves to the parent.
          actions: ["clearTitle", sendParent({ type: "todo.created" })],
        },
        onError: {
          target: "Idle",
        },
      },
    },
  },
});

export const refTodoListMachine = setup({
  types: {
    context: {} as { todos: ReadonlyArray<Todo> },
    events: {} as TodoListEvent,
  },
  actors: {
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
  initial: "Loading",
  states: {
    Loading: {
      /// 👇 Each reader still owns its own fetch and loading state.
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

export const refTodoStatsMachine = setup({
  types: {
    context: {} as { stats: TodoStats },
    events: {} as TodoStatsEvent,
  },
  actors: {
    fetchStats: fromPromise(() =>
      Runtime.runPromise(TodoApi.use((api) => api.stats))
    ),
  },
  actions: {
    assignStats: assign((_, { stats }: { stats: TodoStats }) => ({ stats })),
  },
}).createMachine({
  context: { stats: { total: 0, completed: 0, open: 0 } },
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

export const refTodoScreenMachine = setup({
  types: {
    children: {} as {
      createTodo: "createTodo";
      todoList: "todoList";
      todoStats: "todoStats";
    },
    events: {} as TodoCreatedEvent,
  },
  actors: {
    createTodo: refCreateTodoMachine,
    todoList: refTodoListMachine,
    todoStats: refTodoStatsMachine,
  },
}).createMachine({
  /// 👇 Actors are lifted into a parent so the parent can address each child.
  invoke: [
    { id: "createTodo", src: "createTodo" },
    { id: "todoList", src: "todoList" },
    { id: "todoStats", src: "todoStats" },
  ],
  on: {
    "todo.created": {
      /// 👇 The parent now knows which siblings own todo-derived state.
      actions: [
        sendTo("todoList", { type: "todos.refresh" }),
        sendTo("todoStats", { type: "stats.refresh" }),
      ],
    },
  },
});

export type RefCreateTodoActor = ActorRefFrom<
  typeof refCreateTodoMachine
>;
export type RefTodoListActor = ActorRefFrom<typeof refTodoListMachine>;
export type RefTodoStatsActor = ActorRefFrom<typeof refTodoStatsMachine>;
