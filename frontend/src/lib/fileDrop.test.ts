// @vitest-environment jsdom
import { renderHook } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptsFile, fillFileInput, findDropTarget, findPasteTarget, imagesFromClipboard, pickDroppedFiles, useFileDrop } from "./fileDrop";

afterEach(() => {
  document.body.innerHTML = "";
});

const file = (name: string, type = "") => new File(["x"], name, { type });

describe("파일 끌어다 놓기", () => {
  it("accept 에 맞는 파일만 받는다 (확장자·MIME·image/*, 비어 있으면 모두)", () => {
    expect(acceptsFile(file("a.PDF"), ".pdf,.xlsx")).toBe(true);
    expect(acceptsFile(file("a.exe"), ".pdf,.xlsx")).toBe(false);
    expect(acceptsFile(file("a.png", "image/png"), "image/*")).toBe(true);
    expect(acceptsFile(file("a.txt", "text/plain"), "image/*")).toBe(false);
    expect(acceptsFile(file("a.pdf", "application/pdf"), "application/pdf")).toBe(true);
    expect(acceptsFile(file("anything.bin"), "")).toBe(true);
  });

  it("여러 파일을 받지 않는 칸은 첫 파일 하나만, 받을 수 없는 파일은 뺀다", () => {
    const files = [file("a.exe"), file("b.pdf"), file("c.pdf")];
    expect(pickDroppedFiles(files, { accept: ".pdf", multiple: true }).map((f) => f.name)).toEqual(["b.pdf", "c.pdf"]);
    expect(pickDroppedFiles(files, { accept: ".pdf", multiple: false }).map((f) => f.name)).toEqual(["b.pdf"]);
    expect(pickDroppedFiles([file("a.exe")], { accept: ".pdf", multiple: true })).toEqual([]);
  });

  it("놓은 자리에서 가장 가까운, 파일 칸이 하나뿐인 영역을 찾는다", () => {
    document.body.innerHTML = `
      <form id="form">
        <div id="boxA"><span id="labelA">A</span><input type="file" id="a" /></div>
        <div id="boxB"><span id="labelB">B</span><input type="file" id="b" /></div>
        <p id="free">그냥 글</p>
      </form>
      <div id="single"><span id="inner">안쪽</span><input type="file" id="only" /></div>`;
    const at = (id: string) => document.getElementById(id);
    expect(findDropTarget(at("labelA"))?.input.id).toBe("a");
    expect(findDropTarget(at("labelB"))?.scope.id).toBe("boxB");
    expect(findDropTarget(at("free"))).toBeNull(); // 파일 칸이 둘 이상 섞인 영역은 어느 칸인지 알 수 없다
    expect(findDropTarget(at("inner"))?.input.id).toBe("only");
  });

  it("사용할 수 없는 파일 칸은 건너뛴다", () => {
    document.body.innerHTML = `<div id="box"><span id="x">x</span><input type="file" disabled /></div>`;
    expect(findDropTarget(document.getElementById("x"))).toBeNull();
  });

  it("파일을 넣으면 change 가 알려진다", () => {
    // jsdom 에는 DataTransfer 가 없어 파일 목록만 흉내 낸다 (실제 브라우저·Electron 에는 있다)
    class FakeTransfer {
      files: File[] = [];
      items = { add: (f: File) => this.files.push(f) };
    }
    vi.stubGlobal("DataTransfer", FakeTransfer);
    document.body.innerHTML = `<input type="file" id="f" multiple />`;
    const input = document.getElementById("f") as HTMLInputElement;
    let assigned: File[] = [];
    Object.defineProperty(input, "files", { get: () => assigned, set: (v: File[]) => (assigned = v), configurable: true });
    const onChange = vi.fn();
    input.addEventListener("change", onChange);
    fillFileInput(input, [file("a.pdf"), file("b.pdf")]);
    expect(assigned.map((f) => f.name)).toEqual(["a.pdf", "b.pdf"]);
    expect(onChange).toHaveBeenCalledTimes(1);
    vi.unstubAllGlobals();
  });

  it("클립보드의 이미지만 골라 붙여넣은 이미지_시각.확장자 이름을 붙인다", () => {
    const data = { files: [file("image.png", "image/png"), file("a.txt", "text/plain"), file("x.jpg", "image/jpeg")] } as unknown as DataTransfer;
    const names = imagesFromClipboard(data, new Date("2026-11-09T01:02:03Z")).map((f) => f.name);
    expect(names).toEqual(["붙여넣은 이미지_20261109010203.png", "붙여넣은 이미지_20261109010203_2.jpg"]);
    expect(imagesFromClipboard({ files: [] } as unknown as DataTransfer)).toEqual([]);
  });

  it("붙여넣기: 이미지를 받는 파일 칸이 하나뿐이면 그 칸, 여럿이면 초점이 있는 영역의 칸", () => {
    document.body.innerHTML = `<form><input type="file" id="only" accept="image/png,image/jpeg" /><input type="file" id="csv" accept=".csv" /></form>`;
    expect(findPasteTarget(null)?.id).toBe("only"); // .csv 칸은 이미지를 받지 않으므로 후보에서 뺀다
    document.body.innerHTML = `<div id="a"><button id="ba">a</button><input type="file" id="fa" accept="image/*" /></div><div id="b"><input type="file" id="fb" accept="image/*" /></div>`;
    expect(findPasteTarget(null)).toBeNull(); // 어느 칸인지 애매하면 올리지 않는다
    expect(findPasteTarget(document.getElementById("ba"))?.id).toBe("fa");
  });

  it("붙여넣기: 열린 창이 있으면 그 창 안의 칸만 본다", () => {
    document.body.innerHTML = `<input type="file" id="page" accept="image/*" /><div class="fixed inset-0"><input type="file" id="modal" accept="image/*" /></div>`;
    expect(findPasteTarget(null)?.id).toBe("modal");
  });
});

describe("앱 전체 끌어다 놓기 (useFileDrop)", () => {
  function setup(handlerPrevents: boolean) {
    class FakeTransfer {
      files: File[] = [];
      items = { add: (f: File) => this.files.push(f) };
    }
    vi.stubGlobal("DataTransfer", FakeTransfer);
    document.body.innerHTML = `<div id="zone"><span id="inner">놓는 곳</span><input type="file" id="f" multiple /></div>`;
    const input = document.getElementById("f") as HTMLInputElement;
    Object.defineProperty(input, "files", { get: () => [], set: () => {}, configurable: true });
    const onChange = vi.fn();
    input.addEventListener("change", onChange);
    // 메신저 채팅창처럼 스스로 파일 놓기를 처리하는 곳은 preventDefault 를 한다
    if (handlerPrevents) document.getElementById("zone")!.addEventListener("drop", (e) => e.preventDefault());
    const hook = renderHook(() => useFileDrop());
    const drop = new Event("drop", { bubbles: true, cancelable: true });
    Object.defineProperty(drop, "dataTransfer", { value: { types: ["Files"], files: [file("a.pdf")] } });
    document.getElementById("inner")!.dispatchEvent(drop);
    hook.unmount();
    vi.unstubAllGlobals();
    return onChange;
  }

  it("화면이 직접 처리한 파일 놓기는 다시 올리지 않는다 (메신저에서 두 번 첨부되던 문제)", () => {
    expect(setup(true)).not.toHaveBeenCalled();
  });

  it("처리하는 곳이 없으면 가까운 파일 칸에 올린다", () => {
    expect(setup(false)).toHaveBeenCalledTimes(1);
  });
});
