// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { Link, MemoryRouter, Route, Routes, useLocation, useNavigate } from "react-router-dom";
import { afterEach, describe, expect, it, vi } from "vitest";
import { useTabMenu } from "./TabShellContext";

vi.mock("../../../context/useAuth", () => ({
  useAuth: () => ({ user: { id: 1, name: "박소장", role: "admin", title: null, menu_permissions: [] }, logout: vi.fn() }),
}));
vi.mock("../../../features/attendance/AttendanceToggle", () => ({ AttendanceToggle: () => null }));
vi.mock("../../../features/desktop/DesktopUpdateNotice", () => ({ DesktopUpdateNotice: () => null }));
vi.mock("../SiteAdminSidebar", () => ({ SiteAdminSidebar: () => null }));
vi.mock("../Sidebar", () => ({
  Sidebar: () => {
    const menu = useTabMenu();
    return (
      <nav>
        <button onClick={() => menu?.openMenu("/clients")}>거래처 메뉴</button>
        <button onClick={() => menu?.openMenu("/projects")}>프로젝트 메뉴</button>
      </nav>
    );
  },
}));

import { TabShell } from "./TabShell";

function ClientsPage() {
  const navigate = useNavigate();
  return (
    <div>
      <input aria-label="거래처 검색" />
      <Link to="/clients/5">상세로</Link>
      <button onClick={() => navigate(-1)}>뒤로</button>
    </div>
  );
}

function Where() {
  return <p data-testid="where">{useLocation().pathname}</p>;
}

const routes = (
  <Routes>
    <Route path="/" element={<p>대시보드 화면</p>} />
    <Route path="/clients" element={<ClientsPage />} />
    <Route path="/clients/:id" element={<Where />} />
    <Route path="/projects" element={<p>프로젝트 화면</p>} />
  </Routes>
);

function Probe() {
  return <p data-testid="outer">{useLocation().pathname}</p>;
}

const renderShell = () =>
  render(
    <MemoryRouter initialEntries={["/"]}>
      <TabShell routes={routes} />
      <Probe />
    </MemoryRouter>,
  );

afterEach(cleanup);

describe("탭 틀", () => {
  it("메뉴를 옮겨도 이전 화면에 입력한 내용이 그대로 남는다", () => {
    renderShell();
    fireEvent.click(screen.getByText("거래처 메뉴"));
    const input = screen.getByLabelText("거래처 검색") as HTMLInputElement;
    fireEvent.change(input, { target: { value: "벤치" } });

    fireEvent.click(screen.getByText("프로젝트 메뉴"));
    expect(screen.getByText("프로젝트 화면")).toBeTruthy();
    expect(screen.getByTestId("outer").textContent).toBe("/projects");

    fireEvent.click(screen.getByText("거래처 메뉴"));
    expect((screen.getByLabelText("거래처 검색") as HTMLInputElement).value).toBe("벤치");
    expect(screen.getByTestId("outer").textContent).toBe("/clients");
    expect(screen.getAllByRole("tab")).toHaveLength(3);
  });

  it("탭 안의 링크는 그 탭에서만 이동하고 뒤로가기도 그 탭 기록을 따른다", () => {
    renderShell();
    fireEvent.click(screen.getByText("거래처 메뉴"));
    fireEvent.click(screen.getByText("상세로"));
    expect(screen.getByTestId("where").textContent).toBe("/clients/5");
    expect(screen.getByTestId("outer").textContent).toBe("/clients/5");
    expect(screen.getByText("대시보드 화면")).toBeTruthy(); // 대시보드 탭은 숨겨져 있을 뿐 그대로 있다
  });

  it("탭을 닫으면 그 화면이 사라진다", () => {
    renderShell();
    fireEvent.click(screen.getByText("프로젝트 메뉴"));
    expect(screen.getAllByRole("tab")).toHaveLength(2);
    fireEvent.click(screen.getByLabelText("프로젝트관리 탭 닫기"));
    expect(screen.getAllByRole("tab")).toHaveLength(1);
    expect(screen.queryByText("프로젝트 화면")).toBeNull();
    expect(screen.getByTestId("outer").textContent).toBe("/");
  });
});
