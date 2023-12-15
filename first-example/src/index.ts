import * as Schema from "@effect/schema/Schema";
import { assign, createActor, createMachine } from "xstate";

/** https://youtu.be/vGVvJuazs84?si=4gava-TbvTQijw83&t=1428 */
type MachineType<Event extends string> = Event extends any
  ? { readonly type: Event }
  : never;

type MachineParams<A extends Record<string, Record<string, any>>> =
  keyof A extends infer Type
    ? Type extends keyof A
      ? keyof A[Type] extends ""
        ? { readonly type: Type }
        : { readonly type: Type; readonly params: A[Type] }
      : never
    : never;

/** State machine `context` */
const Context = Schema.struct({
  answer1: Schema.string,
  answer2: Schema.union(Schema.literal("Yes"), Schema.literal("No")),
  answer3: Schema.boolean,
});
interface Context extends Schema.Schema.To<typeof Context> {}

/** Initial default context */
const context = (input: Partial<Context>): Context => ({
  answer1: input.answer1 ?? "",
  answer2: input.answer2 ?? "No",
  answer3: input.answer3 ?? false,
});

type State = "Inactive" | "Active";
type Input = { readonly answer3: boolean };
type Output = { readonly out: number };

type Events = MachineType<"A" | "B">;
type Actions = MachineParams<{
  C: {};
  D: { readonly some: number };
}>;
type Guards = MachineParams<{
  isGreaterThan: { readonly count: number };
}>;

type MachineState<
  S extends string,
  E extends MachineType<any>,
  G extends MachineParams<any>
> = Record<
  S,
  | Record<"on", Record<string | E["type"], { target: S; guard?: G }>>
  | { readonly type: "final" }
>;

const toggleMachine = createMachine(
  {
    id: "toggle",
    initial: "Inactive" satisfies State,
    types: {} as {
      input: Input;
      output: Output;
      context: Context;
      events: Events;
      actions: Actions;
      guards: Guards;
    },
    context: ({ input }) => context(input),
    entry: ({ context, event }) => 0,
    output: ({ context, event }) => ({ out: 10 }),
    states: {
      Inactive: {
        type: "final",
        on: {
          A: {
            target: "Inactive",
            guard: { type: "isGreaterThan", params: { count: 10 } },
          },
        },
      },
      Active: {
        on: { B: { target: "Inactive" } },
      },
    } satisfies MachineState<State, Events, Guards>,
  },
  {
    actions: {
      C: ({ context, event, self, system }) => {
        // Whatever
      },
      D: assign(({ context, event }, { some }) => {
        return {};
      }),
    },
  }
);

const actor = createActor(toggleMachine);
