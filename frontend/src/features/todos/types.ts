export interface Todo {
  id: number;
  content: string;
  is_done: boolean;
  color: string | null; // 메모별 글씨 색. null이면 기본 글씨 색을 따른다
  completed_on: string | null;
  created_at: string;
}
