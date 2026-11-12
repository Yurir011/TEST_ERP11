// @vitest-environment jsdom
import { zipSync } from "fflate";
import { describe, expect, it } from "vitest";
import { composeLayers, defaultVisible, fitLayerSvg, isSafeSvg, layerLabel, layerOrder, looksLikeGerber, renderGerberZip } from "./gerberRender";

// jsdom 에서는 TextEncoder 가 다른 Uint8Array 를 만들어 fflate 가 폴더로 오해하므로, 이 파일의 Uint8Array 로 다시 만든다
const enc = (s: string) => Uint8Array.from(new TextEncoder().encode(s));
const TOP = `%FSLAX26Y26*%\n%MOMM*%\n%TF.FileFunction,Copper,L1,Top*%\n%ADD10C,0.250000*%\n%ADD11R,1.600000X1.600000*%\nG01*\n%LPD*%\nD10*\nX5000000Y5000000D02*\nX25000000Y5000000D01*\nD11*\nX10000000Y10000000D03*\nM02*\n`;
const BOTTOM = TOP.replace("L1,Top", "L2,Bot");
const OUTLINE = `%FSLAX26Y26*%\n%MOMM*%\n%TF.FileFunction,Profile,NP*%\n%ADD10C,0.100000*%\nG01*\n%LPD*%\nD10*\nX0Y0D02*\nX30000000Y0D01*\nX30000000Y20000000D01*\nX0Y20000000D01*\nX0Y0D01*\nM02*\n`;
const DRILL = `M48\nMETRIC,TZ\nT1C0.800\n%\nT1\nX10.0Y10.0\nM30\n`;

describe("거버 zip 읽기", () => {
  it("거버·드릴만 골라 레이어로 만들고 나머지는 건너뛴다", async () => {
    const zip = zipSync({ "top.gtl": enc(TOP), "bottom.gbl": enc(BOTTOM), "outline.gko": enc(OUTLINE), "drill.drl": enc(DRILL), "readme.txt": enc("이건 설명 파일입니다"), "img.png": Uint8Array.from([0x89, 0x50, 0x4e, 0x47, 0, 0, 0]) });
    const r = await renderGerberZip(zip.buffer as ArrayBuffer);
    expect(r.layers.map((l) => l.filename).sort()).toEqual(["bottom.gbl", "drill.drl", "outline.gko", "top.gtl"]);
    expect(r.skipped.sort()).toEqual(["img.png", "readme.txt"]);
    expect(r.layers.find((l) => l.filename === "top.gtl")).toMatchObject({ type: "copper", side: "top" });
    expect(r.layers.find((l) => l.filename === "bottom.gbl")).toMatchObject({ type: "copper", side: "bottom" });
    expect(r.viewBox[2]).toBeGreaterThan(0);
    expect(r.layers.every((l) => l.svg.includes(`width="${r.viewBox[2]}"`) && isSafeSvg(l.svg))).toBe(true);
    expect(r.boardTop).toContain("<svg");
  });

  it("거버가 하나도 없는 zip 은 알기 쉬운 오류를 낸다", async () => {
    const zip = zipSync({ "readme.txt": enc("없음") });
    await expect(renderGerberZip(zip.buffer as ArrayBuffer)).rejects.toThrow("거버 파일을 찾지 못했습니다");
    await expect(renderGerberZip(new Uint8Array([1, 2, 3]).buffer)).rejects.toThrow("zip 파일을 열 수 없습니다");
  });

  it("레이어를 겹쳐 하나의 SVG 로 만들고, 켠 것만 넣는다", async () => {
    const zip = zipSync({ "top.gtl": enc(TOP), "bottom.gbl": enc(BOTTOM), "outline.gko": enc(OUTLINE) });
    const r = await renderGerberZip(zip.buffer as ArrayBuffer);
    const vis = defaultVisible(r.layers); // 위 면 + 공통(외곽선)
    expect(vis.size).toBe(2);
    const svg = composeLayers(r, vis);
    expect(svg.startsWith("<svg")).toBe(true);
    expect((svg.match(/<g color=/g) ?? []).length).toBe(2);
    expect(composeLayers(r, new Set())).not.toContain("<g color=");
  });
});

describe("도우미", () => {
  it("거버·드릴처럼 보이는지 앞부분으로 가린다", () => {
    expect(looksLikeGerber(enc(TOP))).toBe(true);
    expect(looksLikeGerber(enc(DRILL))).toBe(true);
    expect(looksLikeGerber(enc("그냥 글입니다"))).toBe(false);
    expect(looksLikeGerber(new Uint8Array([0, 1, 2, 3]))).toBe(false);
  });
  it("레이어 SVG 의 크기를 viewBox 에 맞추고, 스크립트가 든 SVG 는 거른다", () => {
    expect(fitLayerSvg('<svg viewBox="0 -20 30 20" width="30mm" height="20mm"><path/></svg>', [0, -20, 30, 20])).toBe('<svg viewBox="0 -20 30 20" x="0" y="-20" width="30" height="20"><path/></svg>');
    expect(isSafeSvg('<svg><path d="M0 0"/></svg>')).toBe(true);
    expect(isSafeSvg('<svg onload="x()"></svg>')).toBe(false);
    expect(isSafeSvg("<svg><script>1</script></svg>")).toBe(false);
  });
  it("레이어 이름과 겹치는 순서", () => {
    expect(layerLabel({ type: "copper", side: "top" })).toBe("Top 동박");
    expect(layerLabel({ type: "drill", side: "all" })).toBe("드릴");
    expect(layerOrder({ type: "copper", side: "bottom" })).toBeLessThan(layerOrder({ type: "copper", side: "top" }));
    expect(layerOrder({ type: "silkscreen", side: "top" })).toBeGreaterThan(layerOrder({ type: "copper", side: "top" }));
  });
});
