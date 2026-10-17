import { describe, expect, it } from "vitest";
import { splitLinks } from "./linkify";
import {
  applyIncomingMessage,
  applyReadEvent,
  buildThreadItems,
  dropConfirmedPending,
  formatBytes,
  isInlineViewable,
  listTimeLabel,
  mergeMessages,
  previewOf,
  sortConversations,
  totalUnread,
  unreadReaders,
} from "./messengerState";
import type { ChatMessage, ConversationSummary, PendingMessage } from "./types";

const ME = 1;

const conv = (id: number, over: Partial<ConversationSummary> = {}): ConversationSummary => ({
  id, kind: "direct", title: `대화${id}`, members: [{ id: ME, name: "나", last_read_message_id: null }, { id: 2, name: "상대", last_read_message_id: null }],
  last_message: null, unread_count: 0, muted: false, created_at: "2026-10-01T00:00:00Z", last_message_at: null, ...over,
});

const msg = (id: number, over: Partial<ChatMessage> = {}): ChatMessage => ({
  id, conversation_id: 10, sender_id: 2, sender_name: "상대", body: `메시지 ${id}`, created_at: "2026-10-17T10:00:00Z", client_msg_id: null, attachments: [], ...over,
});

describe("previewOf", () => {
  it("본문 100자, 본문이 없으면 파일 이름", () => {
    expect(previewOf(msg(1, { body: "가".repeat(150) }))).toHaveLength(100);
    expect(previewOf(msg(1, { body: "", attachments: [{ id: 1, file_name: "견적서.pdf", size: 1, content_type: "application/pdf" }] }))).toBe("[파일] 견적서.pdf");
    expect(previewOf(msg(1, { body: "" }))).toBe("");
  });
});

describe("대화방 목록 갱신", () => {
  it("정렬: 마지막 메시지가 최근인 대화방이 위, 메시지가 없으면 만든 시각", () => {
    const list = [conv(1, { last_message_at: "2026-10-17T09:00:00Z" }), conv(2, { last_message_at: "2026-10-17T11:00:00Z" }), conv(3)];
    expect(sortConversations(list).map((c) => c.id)).toEqual([2, 1, 3]);
  });

  it("남이 보낸 새 메시지: 마지막 메시지·안 읽은 수가 갱신되고 맨 위로 올라온다", () => {
    const list = [conv(9, { last_message_at: "2026-10-17T09:00:00Z" }), conv(10)];
    const r = applyIncomingMessage(list, msg(5), { meId: ME, viewingConversationId: null });
    expect(r.known).toBe(true);
    expect(r.list.map((c) => c.id)).toEqual([10, 9]);
    expect(r.list[0].unread_count).toBe(1);
    expect(r.list[0].last_message).toMatchObject({ id: 5, sender_name: "상대", preview: "메시지 5" });
  });

  it("지금 보고 있는 대화방, 내가 보낸 메시지는 안 읽음으로 세지 않는다", () => {
    const list = [conv(10, { unread_count: 2 })];
    expect(applyIncomingMessage(list, msg(5), { meId: ME, viewingConversationId: 10 }).list[0].unread_count).toBe(2);
    const mine = applyIncomingMessage(list, msg(6, { sender_id: ME }), { meId: ME, viewingConversationId: null });
    expect(mine.list[0].unread_count).toBe(2);
    expect(mine.list[0].members.find((m) => m.id === ME)?.last_read_message_id).toBe(6); // 내가 보낸 것은 읽은 것
  });

  it("같은 메시지가 또 오면(중복 이벤트·다시 연결) 두 번 세지 않는다", () => {
    const first = applyIncomingMessage([conv(10)], msg(5), { meId: ME, viewingConversationId: null });
    const again = applyIncomingMessage(first.list, msg(5), { meId: ME, viewingConversationId: null });
    expect(again.list[0].unread_count).toBe(1);
    const older = applyIncomingMessage(first.list, msg(4), { meId: ME, viewingConversationId: null });
    expect(older.list[0].unread_count).toBe(1);
  });

  it("모르는 대화방의 메시지는 known=false (목록을 다시 받아야 한다)", () => {
    const r = applyIncomingMessage([conv(1)], msg(5, { conversation_id: 99 }), { meId: ME, viewingConversationId: null });
    expect(r.known).toBe(false);
  });

  it("totalUnread", () => {
    expect(totalUnread(null)).toBe(0);
    expect(totalUnread([conv(1, { unread_count: 2 }), conv(2, { unread_count: 3 })])).toBe(5);
  });
});

describe("읽음 알림", () => {
  const withLast = conv(10, { unread_count: 3, last_message: { id: 8, sender_id: 2, sender_name: "상대", preview: "", has_attachment: false, created_at: "2026-10-17T10:00:00Z" } });

  it("내가 마지막 메시지까지 읽었으면 안 읽은 수가 0", () => {
    const r = applyReadEvent([withLast], { conversation_id: 10, user_id: ME, message_id: 8 }, ME);
    expect(r.list[0].unread_count).toBe(0);
    expect(r.needsRefetch).toBe(false);
  });

  it("내가 중간까지만 읽었으면 정확한 수를 모르므로 다시 받아야 한다", () => {
    const r = applyReadEvent([withLast], { conversation_id: 10, user_id: ME, message_id: 5 }, ME);
    expect(r.list[0].unread_count).toBe(3);
    expect(r.needsRefetch).toBe(true);
  });

  it("상대가 읽으면 그 사람의 읽은 위치만 갱신하고 뒤로 가지 않는다", () => {
    const r1 = applyReadEvent([withLast], { conversation_id: 10, user_id: 2, message_id: 7 }, ME);
    expect(r1.list[0].members.find((m) => m.id === 2)?.last_read_message_id).toBe(7);
    expect(r1.list[0].unread_count).toBe(3);
    const r2 = applyReadEvent(r1.list, { conversation_id: 10, user_id: 2, message_id: 4 }, ME);
    expect(r2.list[0].members.find((m) => m.id === 2)?.last_read_message_id).toBe(7);
  });

  it("모르는 대화방의 읽음 알림은 무시", () => {
    const r = applyReadEvent([withLast], { conversation_id: 99, user_id: 2, message_id: 1 }, ME);
    expect(r.list).toEqual([withLast]);
  });
});

describe("메시지별 안 읽은 사람 수 (카카오톡 숫자)", () => {
  const member = (id: number, read: number | null) => ({ id, name: `직원${id}`, last_read_message_id: read });
  const msg5 = (sender: number) => ({ id: 5, sender_id: sender });

  it("1:1: 상대가 아직 안 읽었으면 1, 읽으면 0", () => {
    expect(unreadReaders(msg5(1), [member(1, 5), member(2, null)])).toBe(1);
    expect(unreadReaders(msg5(1), [member(1, 5), member(2, 4)])).toBe(1);
    expect(unreadReaders(msg5(1), [member(1, 5), member(2, 5)])).toBe(0);
    expect(unreadReaders(msg5(1), [member(1, 5), member(2, 9)])).toBe(0); // 더 뒤까지 읽었어도 읽은 것
  });

  it("그룹: 아직 읽지 않은 사람만 센다 (보낸 사람은 세지 않는다)", () => {
    const members = [member(1, 5), member(2, 5), member(3, 3), member(4, null)];
    expect(unreadReaders(msg5(1), members)).toBe(2); // 3번, 4번이 아직
    expect(unreadReaders(msg5(1), [member(1, 5), member(2, 5), member(3, 5), member(4, 5)])).toBe(0);
    expect(unreadReaders(msg5(1), [member(1, 0), member(2, null), member(3, null), member(4, null)])).toBe(3);
  });

  it("남이 보낸 메시지도 같은 방식으로 센다 (아직 안 읽은 사람 = 보낸 사람 외 모두 중 안 읽은 사람, 나 포함)", () => {
    const members = [member(1, 2), member(2, 5), member(3, 5)]; // 1번(나)은 아직 5번을 안 읽음
    expect(unreadReaders(msg5(2), members)).toBe(1);
    expect(unreadReaders(msg5(2), [member(1, 5), member(2, 5), member(3, 5)])).toBe(0);
  });

  it("읽기가 진행될수록 숫자가 줄어든다", () => {
    const counts = [null, 3, 5].map((read) => unreadReaders(msg5(1), [member(1, 5), member(2, 5), member(3, read)]));
    expect(counts).toEqual([1, 1, 0]);
  });

  it("보낸 사람 정보가 없는(삭제된 직원) 메시지는 모든 참여자가 대상", () => {
    expect(unreadReaders({ id: 5, sender_id: null }, [member(1, 5), member(2, null)])).toBe(1);
  });

  it("참여자가 없으면 0", () => {
    expect(unreadReaders(msg5(1), [])).toBe(0);
  });
});

describe("메시지 합치기", () => {
  it("번호로 중복을 없애고 오래된 것부터 정렬한다", () => {
    const merged = mergeMessages([msg(3), msg(1)], [msg(2), msg(3, { body: "수정됨" })]);
    expect(merged.map((m) => m.id)).toEqual([1, 2, 3]);
    expect(merged[2].body).toBe("수정됨");
  });

  it("서버에서 확인된 메시지와 같은 client_msg_id 의 '보내는 중' 항목은 지운다", () => {
    const pending: PendingMessage[] = [
      { clientMsgId: "aaaaaaaa", body: "하나", failed: false, createdAt: "" },
      { clientMsgId: "bbbbbbbb", body: "둘", failed: true, createdAt: "" },
    ];
    expect(dropConfirmedPending(pending, [msg(1, { client_msg_id: "aaaaaaaa" })]).map((p) => p.clientMsgId)).toEqual(["bbbbbbbb"]);
    expect(dropConfirmedPending(pending, [msg(2)])).toBe(pending);
  });
});

describe("대화 화면 목록 만들기", () => {
  it("날짜가 바뀔 때 날짜 줄을 넣고, 같은 사람이 5분 안에 이어 보낸 것은 묶는다", () => {
    const items = buildThreadItems(
      [
        msg(1, { created_at: "2026-10-16T23:59:00" }),
        msg(2, { created_at: "2026-10-17T09:00:00" }),
        msg(3, { created_at: "2026-10-17T09:02:00" }),
        msg(4, { created_at: "2026-10-17T09:30:00" }),
        msg(5, { created_at: "2026-10-17T09:31:00", sender_id: ME, sender_name: "나" }),
      ],
      ME,
    );
    expect(items.map((i) => (i.type === "date" ? "날짜" : `m${i.message!.id}`))).toEqual(["날짜", "m1", "날짜", "m2", "m3", "m4", "m5"]);
    const byId = (id: number) => items.find((i) => i.message?.id === id)!;
    expect(byId(2)).toMatchObject({ continued: false, showTime: false }); // 뒤에 3 이 이어진다
    expect(byId(3)).toMatchObject({ continued: true, showTime: true });
    expect(byId(4)).toMatchObject({ continued: false, showTime: true }); // 27분 뒤라 새 묶음
    expect(byId(5)).toMatchObject({ mine: true, continued: false });
    expect(byId(1)).toMatchObject({ showTime: true }); // 날짜가 바뀌므로 묶지 않는다
  });

  it("빈 목록", () => {
    expect(buildThreadItems([], ME)).toEqual([]);
  });
});

describe("표시용 글자", () => {
  it("목록 시각: 오늘은 시:분, 다른 날은 월/일", () => {
    const now = new Date("2026-10-17T15:00:00");
    expect(listTimeLabel("2026-10-17T09:05:00", now)).toBe("09:05");
    expect(listTimeLabel("2026-10-16T09:05:00", now)).toBe("10/16");
    expect(listTimeLabel(null, now)).toBe("");
  });

  it("파일 크기", () => {
    expect(formatBytes(500)).toBe("500B");
    expect(formatBytes(1536)).toBe("1.5KB");
    expect(formatBytes(200 * 1024)).toBe("200KB");
    expect(formatBytes(5 * 1024 * 1024)).toBe("5.0MB");
  });

  it("화면에서 바로 열어도 되는 형식: 이미지(SVG 제외)와 PDF 만", () => {
    for (const t of ["image/png", "image/jpeg", "image/webp", "image/gif", "application/pdf"]) expect(isInlineViewable(t)).toBe(true);
    for (const t of ["image/svg+xml", "text/html", "text/plain", "application/zip"]) expect(isInlineViewable(t)).toBe(false);
  });
});

describe("splitLinks", () => {
  it("http(s) 주소만 링크로 만들고 나머지는 글자 그대로", () => {
    expect(splitLinks("회의록: https://example.com/a?b=1 확인")).toEqual([
      { type: "text", value: "회의록: " },
      { type: "link", value: "https://example.com/a?b=1", href: "https://example.com/a?b=1" },
      { type: "text", value: " 확인" },
    ]);
  });

  it("문장 끝의 마침표·쉼표·괄호는 주소에 넣지 않는다", () => {
    const link = (s: string) => splitLinks(s).find((p) => p.type === "link")?.value;
    expect(link("보세요 https://a.com/x.")).toBe("https://a.com/x");
    expect(link("(https://a.com/x)")).toBe("https://a.com/x");
    expect(link("https://a.com/x, 그리고")).toBe("https://a.com/x");
    expect(link("https://ko.wikipedia.org/wiki/함수_(수학)")).toBe("https://ko.wikipedia.org/wiki/함수_(수학)");
  });

  it("javascript:, data:, file: 와 HTML 은 링크가 되지 않는다", () => {
    for (const t of ["javascript:alert(1)", "data:text/html,<script>1</script>", "file:///C:/x", "<a href='https://x'>x</a>"]) {
      expect(splitLinks(t).some((p) => p.type === "link" && !p.href.startsWith("http"))).toBe(false);
    }
    expect(splitLinks("javascript:alert(1)")).toEqual([{ type: "text", value: "javascript:alert(1)" }]);
    // HTML 글자는 그대로 글자로 남는다 (요소로 해석되지 않는다)
    expect(splitLinks("<script>alert(1)</script>")).toEqual([{ type: "text", value: "<script>alert(1)</script>" }]);
  });

  it("주소가 여러 개, 주소가 없는 글, 빈 글", () => {
    expect(splitLinks("http://a.com https://b.com").filter((p) => p.type === "link")).toHaveLength(2);
    expect(splitLinks("그냥 글")).toEqual([{ type: "text", value: "그냥 글" }]);
    expect(splitLinks("")).toEqual([{ type: "text", value: "" }]);
  });
});
