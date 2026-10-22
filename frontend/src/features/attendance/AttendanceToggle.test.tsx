// @vitest-environment jsdom
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("../../context/useAuth", () => ({ useAuth: () => ({ user: { id: 1, name: "박소장" } }) }));
vi.mock("../../components/ui/dialog/useDialog", () => ({ useDialog: () => ({ confirm: vi.fn(), notifyError: vi.fn() }) }));
vi.mock("../../lib/logger", () => ({ logDebug: vi.fn(), logError: vi.fn() }));
const { apiGet, apiPost } = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock("../../lib/api", () => ({ apiGet, apiPost, ApiError: class extends Error {} }));

import { AttendanceToggle } from "./AttendanceToggle";
import { notifyAttendanceChanged } from "./useAttendanceToday";

const working = { id: 1, user_id: 1, user_name: "박소장", work_date: "2026-10-22", clock_in: "2026-10-22T07:10:00Z", clock_out: null };

beforeEach(() => apiGet.mockResolvedValue(null));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("출근 표시는 서버 값을 따라간다", () => {
  it("화면이 열려 있는 동안 다른 곳에서 출근했어도, 포커스를 받으면 서버 값으로 다시 맞춘다", async () => {
    render(<AttendanceToggle />);
    expect(await screen.findByText("출근 전")).toBeTruthy();
    apiGet.mockResolvedValue(working);
    act(() => {
      window.dispatchEvent(new Event("focus"));
    });
    expect(await screen.findByText("근무중")).toBeTruthy();
  });

  it("다른 화면에서 출퇴근을 누르면 알림을 받아 바로 다시 읽는다", async () => {
    render(<AttendanceToggle />);
    await screen.findByText("출근 전");
    apiGet.mockResolvedValue(working);
    act(() => notifyAttendanceChanged());
    expect(await screen.findByText("근무중")).toBeTruthy();
  });
});
