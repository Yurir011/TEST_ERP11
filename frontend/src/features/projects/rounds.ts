import type { Project } from "./types";

/** 목록용 줄: 올해 회차는 묶음 하나로 합치고, 단독 프로젝트와 지난해 이전 프로젝트는 그대로 한 줄씩 보여 준다. */
export interface ProjectRow {
  /** 줄을 눌렀을 때 열 프로젝트 (묶음이면 진행 중인 회차, 없으면 가장 최근 회차) */
  project: Project;
  /** 묶음이면 올해 회차들 (번호순), 아니면 빈 배열 */
  rounds: Project[];
}

export function mergeRounds(projects: Project[]): ProjectRow[] {
  const rows: ProjectRow[] = [];
  const bundles = new Map<number, ProjectRow>();
  for (const p of projects) {
    if (p.series_id === null || p.round_no === null) {
      rows.push({ project: p, rounds: [] });
      continue;
    }
    let row = bundles.get(p.series_id);
    if (!row) {
      row = { project: p, rounds: [] };
      bundles.set(p.series_id, row);
      rows.push(row);
    }
    row.rounds.push(p);
  }
  for (const row of bundles.values()) {
    row.rounds.sort((a, b) => (a.round_no ?? 0) - (b.round_no ?? 0));
    row.project = row.rounds.find((r) => r.status === "in_progress") ?? row.rounds[row.rounds.length - 1];
  }
  return rows;
}

/** 탭 부제: "02.01 ~ 05.30" (일정이 없으면 빈 문자열) */
export function roundPeriod(p: Pick<Project, "start_date" | "end_date">): string {
  const short = (d: string | null) => (d ? d.slice(5).replace("-", ".") : "");
  if (!p.start_date && !p.end_date) return "";
  return `${short(p.start_date)} ~ ${short(p.end_date)}`;
}
