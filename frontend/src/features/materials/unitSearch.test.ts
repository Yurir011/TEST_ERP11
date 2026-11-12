import { describe, expect, it } from "vitest";
import { matchesWithUnits } from "./unitSearch";

describe("단위값 환산 검색", () => {
  it("나노·마이크로·피코로 적어도 같은 값이면 서로 찾는다", () => {
    expect(matchesWithUnits("MLCC 0.1uF 16V", "100nF")).toBe(true);
    expect(matchesWithUnits("MLCC 0.1µF", "100nF")).toBe(true);
    expect(matchesWithUnits("MLCC 100nF", "0.1uF")).toBe(true);
    expect(matchesWithUnits("MLCC 100,000pF".replace(",", ""), "0.1 uF")).toBe(true);
    expect(matchesWithUnits("MLCC 100nF", "0.22uF")).toBe(false);
  });
  it("저항은 k·M 표기와 Ω·ohm·옴, k 만 쓴 표기도 같은 값으로 본다", () => {
    expect(matchesWithUnits("저항 10kΩ 1%", "10000ohm")).toBe(true);
    expect(matchesWithUnits("저항 10k 1%", "10kΩ")).toBe(true);
    expect(matchesWithUnits("저항 4k7", "4.7kΩ")).toBe(true);
    expect(matchesWithUnits("저항 1MΩ", "1000k")).toBe(true);
    expect(matchesWithUnits("저항 10mΩ", "0.01Ω")).toBe(true); // m 은 밀리
    expect(matchesWithUnits("저항 10mΩ", "10000000Ω")).toBe(false); // 메가(M)와는 다르다
  });
  it("값과 다른 낱말을 함께 적으면 둘 다 맞아야 한다", () => {
    expect(matchesWithUnits("MLCC 0.1uF 16V", "mlcc 100nF")).toBe(true);
    expect(matchesWithUnits("저항 0.1uF", "mlcc 100nF")).toBe(false);
    expect(matchesWithUnits("MLCC 0.1uF 16V", "100nF 16V")).toBe(true);
  });
  it("부품 번호 속 글자는 단위로 보지 않는다", () => {
    expect(matchesWithUnits("STM32F103C8T6", "32F")).toBe(true); // 글자 그대로는 찾는다
    expect(matchesWithUnits("STM32F103C8T6", "32uF")).toBe(false);
    expect(matchesWithUnits("STM32F103C8T6", "32F1")).toBe(true);
  });
  it("글자 그대로 들어 있거나 검색어가 비어 있으면 기존처럼 동작한다", () => {
    expect(matchesWithUnits("USB-C 리셉터클", "usb")).toBe(true);
    expect(matchesWithUnits("USB-C 리셉터클", "")).toBe(true);
    expect(matchesWithUnits("USB-C 리셉터클", "fpc")).toBe(false);
  });
});
