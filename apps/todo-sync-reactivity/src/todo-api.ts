import { Context, Effect, Layer, Ref } from "effect";
import type { Todo } from "./types";

export class TodoApi extends Context.Service<TodoApi>()("TodoApi", {
  make: Effect.gen(function* () {
    const todosRef = yield* Ref.make(initialTodos);

    return {
      create: (title: string) =>
        Effect.gen(function* () {
          yield* Effect.sleep("250 millis");

          const todo: Todo = {
            id: `${Date.now()}-${Math.random()}`,
            title,
            completed: false,
          };

          yield* Ref.update(todosRef, (todos) => [todo, ...todos]);

          return todo;
        }),
      list: Effect.gen(function* () {
        yield* Effect.sleep("250 millis");

        return yield* Ref.get(todosRef);
      }),
      stats: Effect.gen(function* () {
        yield* Effect.sleep("250 millis");

        const todos = yield* Ref.get(todosRef);
        const completed = todos.filter((todo) => todo.completed).length;

        return {
          total: todos.length,
          completed,
          open: todos.length - completed,
        };
      }),
    };
  }),
}) {
  static readonly layer = Layer.effect(this)(this.make);
}

const initialTodos: ReadonlyArray<Todo> = [
  {
    id: "1",
    title: "Write the machine",
    completed: true,
  },
  {
    id: "2",
    title: "Call the API from Effect",
    completed: false,
  },
  {
    id: "3",
    title: "Refresh every reader",
    completed: false,
  },
];
