import { describe, expect, it } from "vitest";
import { formatVersion, isNewerVersion, parseVersion, sameVersion } from "./appVersion";

describe("버전 표기", () => {
  it.each(["V.0.07.150", "v.0.07.150", "V0.07.150", "0.07.150", "0.7.150", "  V.0.07.150 "])("%j 는 같은 버전", (t) => {
    expect(parseVersion(t)).toEqual({ major: 0, minor: 7, patch: 150 });
  });

  it("화면 표기는 V.주.부(2자리).빌드(3자리)", () => {
    expect(formatVersion("0.7.150")).toBe("V.0.07.150");
    expect(formatVersion("1.12.5")).toBe("V.1.12.005");
    expect(formatVersion("0.0.1")).toBe("V.0.00.001");
  });

  it.each(["", "abc", "1.2", "1.2.3.4", "V.0.100.1", "V.0.1.1000", "1.2.x"])("잘못된 형식 %j", (t) => {
    expect(parseVersion(t)).toBeNull();
    expect(formatVersion(t)).toBe(t); // 화면에 빈칸이 생기지 않게 그대로
  });
});

describe("버전 비교", () => {
  it("빌드 → 부 → 주 순으로, 숫자로 비교한다 (9 < 10)", () => {
    expect(isNewerVersion("V.0.07.151", "V.0.07.150")).toBe(true);
    expect(isNewerVersion("V.0.08.001", "V.0.07.999")).toBe(true);
    expect(isNewerVersion("V.1.00.000", "V.0.99.999")).toBe(true);
    expect(isNewerVersion("0.7.100", "0.7.99")).toBe(true);
    expect(isNewerVersion("V.0.07.150", "V.0.07.150")).toBe(false);
    expect(isNewerVersion("V.0.07.149", "V.0.07.150")).toBe(false);
  });

  it("두 표기를 섞어도 되고, 해석할 수 없으면 새 버전으로 보지 않는다", () => {
    expect(isNewerVersion("0.7.151", "V.0.07.150")).toBe(true);
    expect(isNewerVersion("latest", "0.7.150")).toBe(false);
    expect(isNewerVersion("0.7.151", "dev")).toBe(false);
  });

  it("sameVersion", () => {
    expect(sameVersion("V.0.07.150", "0.7.150")).toBe(true);
    expect(sameVersion("V.0.07.150", "V.0.07.151")).toBe(false);
    expect(sameVersion("dev", "dev")).toBe(false);
  });
});
