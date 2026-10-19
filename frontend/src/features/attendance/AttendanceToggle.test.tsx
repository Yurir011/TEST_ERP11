// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { AttendanceToggle } from "./AttendanceToggle";

const confirm = vi.hoisted(() => vi.fn());
const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn() }));
vi.mock("../../components/ui/dialog/useDialog", () => ({ useDialog: () => ({ confirm, notify: vi.fn(), notifyError: vi.fn() }) }));
vi.mock("../../lib/api", () => ({ ApiError: class extends Error {}, apiGet: api.apiGet, apiPost: api.apiPost }));

const working = { clock_in: "2026-10-19T09:00:00", clock_out: null };

beforeEach(() => {
  confirm.mockReset();
  api.apiGet.mockReset().mockResolvedValue(working);
  api.apiPost.mockReset().mockResolvedValue({ ...working, clock_out: "2026-10-19T18:00:00" });
});
afterEach(cleanup);

describe("출퇴근 토글의 퇴근 확인", () => {
  it("퇴근은 확인을 받은 뒤에만 처리한다", async () => {
    render(<AttendanceToggle />);
    const btn = await screen.findByRole("button", { name: "퇴근하기" });
    confirm.mockResolvedValue(false);
    fireEvent.click(btn);
    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(api.apiPost).not.toHaveBeenCalled();
    confirm.mockResolvedValue(true);
    fireEvent.click(btn);
    await waitFor(() => expect(api.apiPost).toHaveBeenCalledWith("/api/attendance/clock-out"));
  });

  it("출근은 묻지 않고 바로 처리한다", async () => {
    api.apiGet.mockResolvedValue(null);
    render(<AttendanceToggle />);
    fireEvent.click(await screen.findByRole("button", { name: "출근하기" }));
    await waitFor(() => expect(api.apiPost).toHaveBeenCalledWith("/api/attendance/clock-in"));
    expect(confirm).not.toHaveBeenCalled();
  });
});
