export interface Todo {
  id: number;
  content: string;
  is_done: boolean;
  completed_on: string | null;
  created_at: string;
}
