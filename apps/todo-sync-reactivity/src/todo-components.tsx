import { useSelector } from "@xstate/react";
import type {
  RefCreateTodoActor,
  RefTodoListActor,
  RefTodoStatsActor,
} from "./ref-machines";
import type {
  SyncCreateTodoActor,
  SyncTodoListActor,
  SyncTodoStatsActor,
} from "./sync-machines";
import type { Todo } from "./types";

export function CreateTodoForm({
  actor,
}: {
  actor: RefCreateTodoActor | SyncCreateTodoActor;
}) {
  const title = useSelector(actor, (snapshot) => snapshot.context.title);
  const isCreating = useSelector(actor, (snapshot) =>
    snapshot.matches("Creating")
  );

  return (
    <form
      className="create-form"
      onSubmit={(event) => {
        event.preventDefault();
        actor.send({ type: "todo.create" });
      }}
    >
      <input
        aria-label="Todo title"
        disabled={isCreating}
        onChange={(event) =>
          actor.send({ type: "title.changed", title: event.target.value })
        }
        placeholder="Add a todo"
        value={title}
      />
      <button disabled={isCreating || title.trim().length === 0} type="submit">
        {isCreating ? "..." : "Add"}
      </button>
    </form>
  );
}

export function TodoListView({
  actor,
}: {
  actor: RefTodoListActor | SyncTodoListActor;
}) {
  const todos = useSelector(actor, (snapshot) => snapshot.context.todos);
  const isLoading = useSelector(actor, (snapshot) =>
    snapshot.matches("Loading")
  );

  return (
    <div className="todo-list-shell" aria-busy={isLoading}>
      <ul className="todo-list">
        {todos.map((todo) => (
          <TodoItem key={todo.id} todo={todo} />
        ))}
      </ul>
    </div>
  );
}

export function TodoStatsView({
  actor,
}: {
  actor: RefTodoStatsActor | SyncTodoStatsActor;
}) {
  const stats = useSelector(actor, (snapshot) => snapshot.context.stats);
  const isLoading = useSelector(actor, (snapshot) =>
    snapshot.matches("Loading")
  );

  return (
    <div className="todo-stats" aria-busy={isLoading}>
      <span>Total: {stats.total}</span>
      <span>Open: {stats.open}</span>
      <span>Done: {stats.completed}</span>
    </div>
  );
}

function TodoItem({ todo }: { todo: Todo }) {
  return (
    <li>
      <span className={todo.completed ? "todo-done" : undefined}>
        {todo.title}
      </span>
    </li>
  );
}
