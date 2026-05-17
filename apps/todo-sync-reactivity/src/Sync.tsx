import { useActorRef } from "@xstate/react";
import {
  syncCreateTodoMachine,
  syncTodoListMachine,
  syncTodoStatsMachine,
} from "./sync-machines";
import { CreateTodoForm, TodoListView, TodoStatsView } from "./todo-components";

export default function Sync() {
  return (
    <section className="demo">
      <SyncCreateTodo />
      <SyncTodoStats />
      <SyncTodoList />
    </section>
  );
}

function SyncCreateTodo() {
  const actor = useActorRef(syncCreateTodoMachine);

  return <CreateTodoForm actor={actor} />;
}

function SyncTodoList() {
  const actor = useActorRef(syncTodoListMachine);

  return <TodoListView actor={actor} />;
}

function SyncTodoStats() {
  const actor = useActorRef(syncTodoStatsMachine);

  return <TodoStatsView actor={actor} />;
}
