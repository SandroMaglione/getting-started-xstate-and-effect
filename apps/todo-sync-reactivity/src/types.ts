export type Todo = {
  readonly id: string;
  readonly title: string;
  readonly completed: boolean;
};

export type TodoStats = {
  readonly total: number;
  readonly completed: number;
  readonly open: number;
};
