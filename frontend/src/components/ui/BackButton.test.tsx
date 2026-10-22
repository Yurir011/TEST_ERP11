// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { MemoryRouter, Route, Routes } from "react-router-dom";
import { afterEach, describe, expect, it } from "vitest";
import { BackButton } from "./BackButton";

afterEach(cleanup);

describe("뒤로가기 버튼", () => {
  it("누르면 들어오기 전 화면으로 돌아간다", () => {
    render(
      <MemoryRouter initialEntries={["/project-documents", "/proposals/new"]} initialIndex={1}>
        <Routes>
          <Route path="/project-documents" element={<p>문서 목록 화면</p>} />
          <Route path="/proposals/new" element={<BackButton />} />
        </Routes>
      </MemoryRouter>,
    );
    fireEvent.click(screen.getByRole("button", { name: "뒤로가기" }));
    expect(screen.getByText("문서 목록 화면")).toBeTruthy();
  });
});
