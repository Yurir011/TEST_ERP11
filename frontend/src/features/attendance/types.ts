export interface AttendanceRecord {
  id: number;
  user_id: number;
  user_name: string;
  work_date: string;
  clock_in: string | null;
  clock_out: string | null;
}
