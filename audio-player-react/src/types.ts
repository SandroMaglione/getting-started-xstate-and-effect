/* eslint-disable @typescript-eslint/no-explicit-any */
export type MachineType<Event extends string> = Event extends any
  ? { readonly type: Event }
  : never;

export type MachineParams<A extends Record<string, Record<string, any>>> =
  keyof A extends infer Type
    ? Type extends keyof A
      ? keyof A[Type] extends ""
        ? { readonly type: Type }
        : { readonly type: Type; readonly params: A[Type] }
      : never
    : never;
