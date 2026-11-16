// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProjectReleasePanel, type Release } from "./ProjectReleasePanel";

const api = vi.hoisted(() => ({ apiGet: vi.fn(), apiPost: vi.fn(), apiPut: vi.fn(), apiDelete: vi.fn(), apiUploadForm: vi.fn(), downloadFile: vi.fn() }));
vi.mock("../../lib/api", () => ({ ...api, ApiError: class extends Error {} }));
vi.mock("../../components/ui/dialog/useDialog", () => ({ useDialog: () => ({ confirm: vi.fn(), prompt: vi.fn(), notify: vi.fn(), notifyError: vi.fn() }) }));

const file = (id: number, category: string, group: string | null, filename: string) => ({ id, category, group, filename, file_size: 10, created_at: "2026-08-10T00:00:00Z" });
const releases: Release[] = [
  { id: 2, project_id: 1, version: "V.1.10.000", release_date: "2026-08-10", files: [file(1, "bom", null, "aaa.xlsx"), file(2, "firmware", "bin", "fw.bin"), file(3, "firmware", "src", "main.c")] as Release["files"] },
  { id: 1, project_id: 1, version: "V.1.00.000", release_date: "2026-06-10", files: [] },
];

beforeEach(() => api.apiGet.mockResolvedValue(releases));
afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const renderPanel = (formOpen = false) => render(<ProjectReleasePanel projectId={1} formOpen={formOpen} setFormOpen={vi.fn()} onOpenBom={vi.fn()} onOpenGerberViewer={vi.fn()} />);

describe("프로젝트 파일 관리", () => {
  it("히스토리를 최신순으로 보여주고 BOM 파일을 먼저 보여준다", async () => {
    renderPanel();
    await screen.findByText("aaa.xlsx");
    const versions = screen.getAllByRole("button", { pressed: undefined }).filter((b) => /^V\.1\./.test(b.textContent ?? ""));
    expect(versions.map((b) => b.textContent?.slice(0, 10))).toEqual(["V.1.10.000", "V.1.00.000"]);
  });

  it("7개 항목이 나오고 Firmware 는 bin 과 src 로 나뉜다", async () => {
    renderPanel();
    await screen.findByText("aaa.xlsx");
    for (const label of ["BOM", "Gerber", "Pick Place", "KiCad", "STEP", "Firmware", "GUI"]) expect(screen.getByRole("button", { name: new RegExp(`^${label} ?[0-9]*$`) })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /^Firmware/ }));
    expect(screen.getByText("fw.bin")).toBeTruthy();
    expect(screen.getByText("main.c")).toBeTruthy();
    expect(screen.getAllByText("bin").length).toBeGreaterThan(1); // 묶음 제목 + 올릴 묶음 버튼
    expect(screen.getAllByText("src").length).toBeGreaterThan(1);
  });

  it("파일 버전을 입력해 등록한다", async () => {
    api.apiPost.mockResolvedValue({ id: 3, project_id: 1, version: "V.1.20.000", release_date: "2026-11-16", files: [] });
    renderPanel(true);
    fireEvent.change(await screen.findByLabelText("파일 버전"), { target: { value: "V.1.20.000" } });
    fireEvent.click(screen.getByRole("button", { name: "등록" }));
    await waitFor(() => expect(api.apiPost).toHaveBeenCalledWith("/api/projects/1/releases", expect.objectContaining({ version: "V.1.20.000" })));
  });
});
