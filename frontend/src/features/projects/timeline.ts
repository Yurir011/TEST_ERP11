import { toLocalISODate } from "../../lib/date";
import type { ProgressStage, Project } from "./types";

// ── 주차 기반 진행 타임라인 계산용 헬퍼 ──
export const TIMELINE_LABEL_WIDTH = "6rem";

export function parseDate(dateStr: string): Date {
  return new Date(`${dateStr}T00:00:00`);
}

export function diffDays(from: Date, to: Date): number {
  return Math.round((to.getTime() - from.getTime()) / 86400000);
}

// 프로젝트 시작일 기준 몇 번째 주차인지 계산 (1주차부터 시작)
export function dateToWeek(dateStr: string, projectStart: string): number {
  return Math.floor(diffDays(parseDate(projectStart), parseDate(dateStr)) / 7) + 1;
}

export function stageWeekRange(
  stage: ProgressStage,
  projectStart: string,
  totalWeeks: number
): [number, number] | null {
  if (!stage.start_date || !stage.end_date) return null;
  const startWeek = Math.max(1, dateToWeek(stage.start_date, projectStart));
  const endWeek = Math.min(totalWeeks, dateToWeek(stage.end_date, projectStart));
  if (endWeek < startWeek) return null;
  return [startWeek, endWeek];
}

/** 날짜 비율로 그리는 바의 위치. 전체 폭(총 주수 x 7일)을 1로 보았을 때의 시작 위치·폭이다. */
export interface StageDayRange {
  left: number;
  width: number;
  /** 항목 기간의 실제 일수 (프로젝트 기간 밖으로 잘리기 전 값, 시작·종료일 포함) */
  days: number;
}

// 항목의 시작·종료일을 프로젝트 시작일 기준 "일" 단위 위치로 바꾼다. 주 단위로 뭉개지 않아 같은 주 안의 날짜 차이도 그래프에 드러난다.
export function stageDayRange(stage: ProgressStage, projectStart: string, totalWeeks: number): StageDayRange | null {
  if (!stage.start_date || !stage.end_date) return null;
  const span = totalWeeks * 7;
  const origin = parseDate(projectStart);
  const startDay = Math.max(0, diffDays(origin, parseDate(stage.start_date)));
  const endDay = Math.min(span - 1, diffDays(origin, parseDate(stage.end_date)));
  if (endDay < startDay) return null;
  return {
    left: startDay / span,
    width: (endDay - startDay + 1) / span,
    days: diffDays(parseDate(stage.start_date), parseDate(stage.end_date)) + 1,
  };
}

/** "2026-10-05" → "10/05" */
export function formatMonthDay(dateStr: string): string {
  return dateStr.slice(5).replace("-", "/");
}

// 오늘이 전체 기간 안에 있을 때만 0~1 사이 위치(비율)를 반환한다.
export function todayFraction(projectStart: string, totalWeeks: number): number | null {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = diffDays(parseDate(projectStart), today);
  const totalDays = totalWeeks * 7;
  if (days < 0 || days > totalDays) return null;
  return days / totalDays;
}

// 종합 진행률 옆에 붙일 주차 요약: "3주차 / 총 8주". 일정이 없으면 null, 기간 밖이면 시작 전/종료로 표시한다.
export function weekSummary(project: Project): string | null {
  if (!project.start_date || !project.end_date) return null;
  const totalWeeks = Math.max(1, Math.ceil((diffDays(parseDate(project.start_date), parseDate(project.end_date)) + 1) / 7));
  const todayStr = toLocalISODate(new Date());
  if (todayStr < project.start_date) return `시작 전 / 총 ${totalWeeks}주`;
  if (todayStr > project.end_date) return `종료 / 총 ${totalWeeks}주`;
  return `${dateToWeek(todayStr, project.start_date)}주차 / 총 ${totalWeeks}주`;
}

// 진행상황 항목들의 진행율 평균을 종합 진행률로 계산한다. 서버가 10 단위 값만 받으므로 가장 가까운 10 단위로 반올림한다.
export function calcStageProgress(stages: ProgressStage[]): number | null {
  if (stages.length === 0) return null;
  const sum = stages.reduce((acc, s) => acc + s.progress_percent, 0);
  return Math.round(sum / stages.length / 10) * 10;
}
