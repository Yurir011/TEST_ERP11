import { describe, expect, it } from "vitest";
import { compareVersions, formatVersion, isNewer, parseVersion, toSemver } from "./version";

describe("버전 표기", () => {
  it.each(["V.0.07.150", "v.0.07.150", "V0.07.150", "0.07.150", "0.7.150", "  V.0.07.150 "])("%j 는 같은 버전으로 해석된다", (text) => {
    expect(parseVersion(text)).toEqual({ major: 0, minor: 7, patch: 150 });
  });

  it("화면 표기는 V.주.부(2자리).빌드(3자리), 내부 표기는 0 을 붙이지 않는다", () => {
    const v = parseVersion("V.0.07.150")!;
    expect(formatVersion(v)).toBe("V.0.07.150");
    expect(toSemver(v)).toBe("0.7.150"); // npm 이 인정하는 형식 (07 은 안 된다)
    expect(formatVersion("0.7.150")).toBe("V.0.07.150");
    expect(formatVersion("1.12.5")).toBe("V.1.12.005");
    expect(formatVersion("0.0.1")).toBe("V.0.00.001");
  });

  it.each(["", "abc", "1.2", "1.2.3.4", "V.0.100.1", "V.0.1.1000", "V.0.-1.5", "1.2.x"])("잘못된 형식 %j 는 null", (text) => {
    expect(parseVersion(text)).toBeNull();
  });

  it("해석할 수 없는 값은 그대로 돌려준다 (화면에 빈칸이 생기지 않게)", () => {
    expect(formatVersion("개발 버전")).toBe("개발 버전");
  });
});

describe("버전 비교", () => {
  it("빌드 번호, 부 번호, 주 번호 순으로 비교한다", () => {
    expect(isNewer("V.0.07.151", "V.0.07.150")).toBe(true);
    expect(isNewer("V.0.08.001", "V.0.07.999")).toBe(true);
    expect(isNewer("V.1.00.000", "V.0.99.999")).toBe(true);
    expect(isNewer("V.0.07.150", "V.0.07.150")).toBe(false);
    expect(isNewer("V.0.07.149", "V.0.07.150")).toBe(false);
  });

  it("두 표기를 섞어도 비교된다", () => {
    expect(compareVersions("0.7.151", "V.0.07.150")).toBeGreaterThan(0);
    expect(compareVersions("V.0.07.150", "0.7.150")).toBe(0);
  });

  it("숫자로 비교한다 (글자 순서가 아니다: 9 < 10)", () => {
    expect(isNewer("0.7.100", "0.7.99")).toBe(true);
    expect(isNewer("0.10.1", "0.9.9")).toBe(true);
  });

  it("해석할 수 없는 값이 있으면 새 버전으로 보지 않는다 (잘못된 안내가 뜨지 않게)", () => {
    expect(compareVersions("latest", "0.7.150")).toBeNull();
    expect(isNewer("latest", "0.7.150")).toBe(false);
    expect(isNewer("0.7.151", "dev")).toBe(false);
  });
});
