import { describe, expect, it } from "vitest";
import { buildLatestJson, builtInstallerName, planBump, publishedInstallerName, setJsonVersion, setPythonVersion } from "./release";
import { parseVersion } from "./version";

describe("설치 파일 이름", () => {
  it("만들어지는 이름과 서버에 올리는 이름", () => {
    expect(builtInstallerName("0.7.150")).toBe("BENCH-ERP_Setup_0.7.150.exe");
    expect(publishedInstallerName(parseVersion("0.7.150")!)).toBe("BENCH-ERP_V.0.07.150_Setup.exe");
    expect(publishedInstallerName(parseVersion("1.12.5")!)).toBe("BENCH-ERP_V.1.12.005_Setup.exe");
  });
});

describe("setJsonVersion", () => {
  const pkg = `{\n  "name": "bench-desktop",\n  "version": "0.0.1",\n  "dependencies": {\n    "serialport": "13.0.0",\n    "x": { "version": "9.9.9" }\n  }\n}\n`;

  it("최상위 version 만 바꾸고 나머지는 글자 그대로 둔다", () => {
    const out = setJsonVersion(pkg, "0.7.151");
    expect(out).toContain('"version": "0.7.151"');
    expect(out).toContain('"version": "9.9.9"'); // 다른 version 은 그대로
    expect(out.replace("0.7.151", "0.0.1")).toBe(pkg);
    expect(JSON.parse(out).version).toBe("0.7.151");
  });

  it("package-lock.json 은 packages[''] 의 version 도 함께 바꾼다", () => {
    const lock = `{\n  "name": "bench-desktop",\n  "version": "0.0.1",\n  "lockfileVersion": 3,\n  "packages": {\n    "": {\n      "name": "bench-desktop",\n      "version": "0.0.1",\n      "dependencies": {}\n    },\n    "node_modules/a": {\n      "version": "5.0.0"\n    }\n  }\n}\n`;
    const parsed = JSON.parse(setJsonVersion(lock, "0.7.151"));
    expect(parsed.version).toBe("0.7.151");
    expect(parsed.packages[""].version).toBe("0.7.151");
    expect(parsed.packages["node_modules/a"].version).toBe("5.0.0");
  });

  it("version 항목이 없으면 오류", () => {
    expect(() => setJsonVersion('{ "name": "x" }', "1.0.0")).toThrow();
  });
});

describe("setPythonVersion", () => {
  it("APP_VERSION 줄만 바꾼다", () => {
    const src = '"""문서"""\nimport re\n\nAPP_VERSION = "0.7.150"\n\nOTHER = "0.7.150"\n';
    expect(setPythonVersion(src, "0.7.151")).toBe('"""문서"""\nimport re\n\nAPP_VERSION = "0.7.151"\n\nOTHER = "0.7.150"\n');
  });
  it("줄이 없으면 오류", () => {
    expect(() => setPythonVersion("x = 1", "0.7.151")).toThrow();
  });
});

describe("planBump", () => {
  it("새 버전을 두 표기로 돌려준다", () => {
    expect(planBump("V.0.07.151", "0.7.150")).toMatchObject({ semver: "0.7.151", display: "V.0.07.151" });
    expect(planBump("0.8.1", "0.7.150")).toMatchObject({ semver: "0.8.1", display: "V.0.08.001" });
  });
  it("형식이 틀리거나 같거나 낮은 버전은 거절하고, --force 면 허용", () => {
    expect(() => planBump("abc", "0.7.150")).toThrow(/형식/);
    expect(() => planBump("V.0.07.150", "0.7.150")).toThrow(/이미 현재 버전/);
    expect(() => planBump("V.0.07.149", "0.7.150")).toThrow(/낮습니다/);
    expect(planBump("V.0.07.149", "0.7.150", true).semver).toBe("0.7.149");
  });
});

describe("buildLatestJson", () => {
  it("서버가 앱에 알려 주는 정보", () => {
    const j = buildLatestJson(parseVersion("0.7.150")!, 12345, "abc", "  NFC 로그인, 메신저  ", new Date("2026-10-17T00:00:00Z"));
    expect(j).toEqual({
      version: "0.7.150", display: "V.0.07.150", filename: "BENCH-ERP_V.0.07.150_Setup.exe", size: 12345, sha256: "abc",
      notes: "NFC 로그인, 메신저", published_at: "2026-10-17T00:00:00.000Z",
    });
  });
});
