import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { DEFAULT_POLL_INTERVAL_MS, MailPoller, type PollResult, resolvePollInterval } from "./poller";

const empty: PollResult = { unread: 0, newMail: [], changed: false };

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe("새 메일 주기 확인", () => {
  it("시작하면 첫 지연 뒤 한 번, 그다음부터 정해진 간격마다 확인하고 결과를 넘긴다", async () => {
    const results: PollResult[] = [];
    let n = 0;
    const poller = new MailPoller({ intervalMs: 1000, initialDelayMs: 200, poll: async () => ({ ok: true, value: { ...empty, unread: ++n } }), onResult: (r) => results.push(r) });
    poller.start();
    expect(results).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(199);
    expect(results).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(1);
    expect(results.map((r) => r.unread)).toEqual([1]);
    await vi.advanceTimersByTimeAsync(1000);
    await vi.advanceTimersByTimeAsync(1000);
    expect(results.map((r) => r.unread)).toEqual([1, 2, 3]);
    poller.stop();
    await vi.advanceTimersByTimeAsync(5000);
    expect(results).toHaveLength(3); // 멈춘 뒤에는 더 확인하지 않는다
  });

  it("확인이 아직 끝나지 않았으면 겹쳐서 다시 확인하지 않는다", async () => {
    let calls = 0;
    let release: (v: { ok: true; value: PollResult }) => void = () => {};
    const poller = new MailPoller({ intervalMs: 1000, poll: () => (calls++, new Promise((r) => (release = r))), onResult: () => {} });
    const first = poller.pollNow();
    await poller.pollNow();
    await poller.pollNow();
    expect(calls).toBe(1);
    release({ ok: true, value: empty });
    await first;
    const next = poller.pollNow(); // 끝난 뒤에는 다시 확인할 수 있다
    expect(calls).toBe(2);
    release({ ok: true, value: empty });
    await next;
  });

  it("확인에 실패해도 멈추지 않고 다음 시간에 다시 시도하며, 결과는 성공할 때만 넘긴다", async () => {
    const results: PollResult[] = [];
    const outcomes: ({ ok: true; value: PollResult } | { ok: false; error: string })[] = [
      { ok: false, error: "서버에 연결할 수 없습니다" },
      { ok: false, error: "서버에 연결할 수 없습니다" },
      { ok: true, value: { ...empty, unread: 4, changed: true } },
    ];
    let i = 0;
    const poller = new MailPoller({ intervalMs: 500, initialDelayMs: 0, poll: async () => outcomes[i++] ?? { ok: true, value: empty }, onResult: (r) => results.push(r) });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(results).toHaveLength(0);
    await vi.advanceTimersByTimeAsync(500);
    expect(results).toEqual([{ unread: 4, newMail: [], changed: true }]);
    poller.stop();
  });

  it("확인 중 예외가 나도 다음 시간에 다시 시도한다", async () => {
    let calls = 0;
    const poller = new MailPoller({
      intervalMs: 300,
      initialDelayMs: 0,
      poll: async () => {
        calls++;
        if (calls === 1) throw new Error("예상 못 한 오류");
        return { ok: true, value: empty };
      },
      onResult: () => {},
    });
    poller.start();
    await vi.advanceTimersByTimeAsync(0);
    await vi.advanceTimersByTimeAsync(300);
    expect(calls).toBe(2);
    poller.stop();
  });

  it("시작을 두 번 불러도 타이머가 두 개가 되지 않는다", async () => {
    let calls = 0;
    const poller = new MailPoller({ intervalMs: 1000, initialDelayMs: 100, poll: async () => (calls++, { ok: true, value: empty }), onResult: () => {} });
    poller.start();
    poller.start();
    await vi.advanceTimersByTimeAsync(100);
    expect(calls).toBe(1);
    poller.stop();
  });
});

describe("확인 간격 값", () => {
  it("바깥에서 온 값은 안전한 범위로만 쓴다", () => {
    expect(resolvePollInterval(undefined)).toBe(DEFAULT_POLL_INTERVAL_MS);
    expect(resolvePollInterval("abc")).toBe(DEFAULT_POLL_INTERVAL_MS);
    expect(resolvePollInterval("10")).toBe(DEFAULT_POLL_INTERVAL_MS); // 너무 짧은 간격은 서버에 부담이라 기본값
    expect(resolvePollInterval("-5")).toBe(DEFAULT_POLL_INTERVAL_MS);
    expect(resolvePollInterval("5000")).toBe(5000);
    expect(resolvePollInterval("99999999")).toBe(3_600_000);
  });
});
