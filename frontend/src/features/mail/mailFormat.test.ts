import { describe, expect, it } from "vitest";
import type { MailFolder } from "../../lib/desktop";
import { folderLabel, formatFileSize, formatMailDate, formatMailDateTime, isSelfMailFolder, pageNumbers, senderLabel, sortFolders, subjectLabel } from "./mailFormat";

const f = (path: string, specialUse: string | null = null, name = path): MailFolder => ({ path, name, specialUse, unread: 0, total: 0 });

describe("폴더 이름·순서", () => {
  it("INBOX 와 특수 폴더는 한글 이름으로, 나머지는 서버 이름 그대로", () => {
    expect(folderLabel(f("INBOX"))).toBe("받은메일함");
    expect(folderLabel(f("inbox"))).toBe("받은메일함");
    expect(folderLabel(f("Sent", "\\Sent"))).toBe("보낸메일함");
    expect(folderLabel(f("Drafts", "\\Drafts"))).toBe("임시보관함");
    expect(folderLabel(f("Trash", "\\Trash"))).toBe("휴지통");
    expect(folderLabel(f("Spam", "\\Junk"))).toBe("스팸메일함");
    expect(folderLabel(f("프로젝트A"))).toBe("프로젝트A");
    expect(folderLabel(f("*"))).toBe("전체메일");
  });

  it("내게쓴메일함은 이름으로 알아본다 (공백이 있어도)", () => {
    expect(isSelfMailFolder(f("x", null, "내게쓴메일함"))).toBe(true);
    expect(isSelfMailFolder(f("x", null, "내게 쓴 메일함"))).toBe(true);
    expect(isSelfMailFolder(f("x", null, "보낸메일함"))).toBe(false);
  });

  it("받은 → 내게쓴 → 보낸 → 임시보관 → 사용자 폴더(이름순) → 스팸 → 휴지통 순서", () => {
    const sorted = sortFolders([f("Trash", "\\Trash"), f("나중에"), f("Sent", "\\Sent"), f("INBOX"), f("Junk", "\\Junk"), f("가나다"), f("Drafts", "\\Drafts"), f("me", null, "내게쓴메일함")]);
    expect(sorted.map((x) => x.path)).toEqual(["INBOX", "me", "Sent", "Drafts", "가나다", "나중에", "Junk", "Trash"]);
  });
});

describe("날짜 표시", () => {
  const now = new Date(2026, 9, 17, 15, 30).getTime();
  it("오늘은 시:분, 올해는 월/일, 다른 해는 연.월.일", () => {
    expect(formatMailDate(new Date(2026, 9, 17, 9, 5).getTime(), now)).toBe("09:05");
    expect(formatMailDate(new Date(2026, 8, 3, 9, 5).getTime(), now)).toBe("9/3");
    expect(formatMailDate(new Date(2025, 11, 31, 23, 59).getTime(), now)).toBe("2025.12.31");
  });
  it("상세 날짜는 연.월.일 시:분", () => {
    expect(formatMailDateTime(new Date(2026, 0, 2, 3, 4).getTime())).toBe("2026.01.02 03:04");
  });
});

describe("보낸 사람·제목·크기", () => {
  it("이름이 없으면 주소, 둘 다 없으면 안내 문구", () => {
    expect(senderLabel({ fromName: "홍길동", fromAddr: "h@t.l" })).toBe("홍길동");
    expect(senderLabel({ fromName: "", fromAddr: "h@t.l" })).toBe("h@t.l");
    expect(senderLabel({ fromName: "", fromAddr: "" })).toBe("(보낸 사람 없음)");
  });
  it("제목이 비어 있으면 안내 문구", () => {
    expect(subjectLabel({ subject: "   " })).toBe("(제목 없음)");
    expect(subjectLabel({ subject: "견적서" })).toBe("견적서");
  });
  it("파일 크기 단위", () => {
    expect(formatFileSize(500)).toBe("500B");
    expect(formatFileSize(2048)).toBe("2.0KB");
    expect(formatFileSize(300 * 1024)).toBe("300KB");
    expect(formatFileSize(5 * 1024 * 1024)).toBe("5.0MB");
  });
});

describe("쪽 번호", () => {
  it("쪽이 적으면 전부, 많으면 현재 쪽 주위 10개", () => {
    expect(pageNumbers(1, 1)).toEqual([1]);
    expect(pageNumbers(2, 3)).toEqual([1, 2, 3]);
    expect(pageNumbers(1, 25)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10]);
    expect(pageNumbers(13, 25)).toEqual([8, 9, 10, 11, 12, 13, 14, 15, 16, 17]);
    expect(pageNumbers(25, 25)).toEqual([16, 17, 18, 19, 20, 21, 22, 23, 24, 25]);
  });
  it("쪽이 없으면 빈 목록", () => {
    expect(pageNumbers(1, 0)).toEqual([]);
  });
});
