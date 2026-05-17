import { useMachine } from "@xstate/react";
import {
  refTodoScreenMachine,
  type RefCreateTodoActor,
  type RefTodoListActor,
  type RefTodoStatsActor,
} from "./ref-machines";
import { CreateTodoForm, TodoListView, TodoStatsView } from "./todo-components";

export default function Ref() {
  const [snapshot] = useMachine(refTodoScreenMachine);
  const createTodoActor = snapshot.children.createTodo;
  const todoListActor = snapshot.children.todoList;
  const todoStatsActor = snapshot.children.todoStats;

  return (
    <section className="demo">
      {createTodoActor && <RefCreateTodo actor={createTodoActor} />}
      {todoStatsActor && <RefTodoStats actor={todoStatsActor} />}
      {todoListActor && <RefTodoList actor={todoListActor} />}
    </section>
  );
}

function RefCreateTodo({ actor }: { actor: RefCreateTodoActor }) {
  return <CreateTodoForm actor={actor} />;
}

function RefTodoList({ actor }: { actor: RefTodoListActor }) {
  return <TodoListView actor={actor} />;
}

function RefTodoStats({ actor }: { actor: RefTodoStatsActor }) {
  return <TodoStatsView actor={actor} />;
}
