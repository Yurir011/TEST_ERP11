// @vitest-environment jsdom
import { afterEach, describe, expect, it, vi } from "vitest";
import { acceptsFile, fillFileInput, findDropTarget, pickDroppedFiles } from "./fileDrop";

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
});
