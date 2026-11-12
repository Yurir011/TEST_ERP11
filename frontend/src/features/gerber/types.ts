/** 프로젝트에 등록한 거버 한 벌(zip) 하나: 서버 응답 모양 */
export interface Gerber {
  id: number;
  project_id: number;
  /** "Rev A", "Rev B" ... 등록할 때 자동으로 붙는다 */
  revision: string;
  filename: string;
  file_size: number;
  /** zip 안의 파일 이름들 */
  layer_names: string[];
  note: string | null;
  uploaded_by: string | null;
  created_at: string;
  is_latest: boolean;
}

export function formatBytes(n: number): string {
  if (n < 1024) return `${n}B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)}KB`;
  return `${(n / 1024 / 1024).toFixed(1)}MB`;
}
