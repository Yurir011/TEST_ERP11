/** 새 메일 알림 문구 만들기 (시스템 알림에 띄울 제목·내용). 순수 함수라 따로 시험한다. */
import type { NewMailInfo } from "./types";

export interface NewMailNotice {
  title: string;
  body: string;
}

const clean = (s: string, max: number): string => {
  const one = s.replace(/[\r\n\t]+/g, " ").replace(/\s{2,}/g, " ").trim();
  return one.length > max ? `${one.slice(0, max - 1)}…` : one;
};

/**
 * 한 통이면 "보낸 사람 / 제목", 여러 통이면 "새 메일 N통" 과 앞의 세 통(그 밖은 "외 N통").
 * 알림이 화면을 가득 채우지 않도록 길이를 줄인다.
 */
export function formatNewMailNotice(items: NewMailInfo[]): NewMailNotice | null {
  if (items.length === 0) return null;
  if (items.length === 1) return { title: clean(items[0].from, 60) || "새 메일", body: clean(items[0].subject, 120) };
  const lines = items.slice(0, 3).map((m) => `${clean(m.from, 24)}: ${clean(m.subject, 60)}`);
  if (items.length > 3) lines.push(`외 ${items.length - 3}통`);
  return { title: `새 메일 ${items.length}통`, body: lines.join("\n") };
}
