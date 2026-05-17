import { Layer, ManagedRuntime } from "effect";
import { AppSync } from "./app-sync";
import { TodoApi } from "./todo-api";

/// 👇 Every actor uses this runtime, so reads and invalidations share services.
export const Runtime = ManagedRuntime.make(
  Layer.mergeAll(TodoApi.layer, AppSync.layer)
);
