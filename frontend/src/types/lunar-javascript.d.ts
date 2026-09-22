declare module "lunar-javascript" {
  export class Solar {
    static fromYmd(year: number, month: number, day: number): Solar;
    getYear(): number;
    getMonth(): number;
    getDay(): number;
    getLunar(): Lunar;
  }

  export class Lunar {
    /** month이 음수이면 윤달(예: -8 = 윤8월)을 의미한다. 유효하지 않은 날짜는 Error를 throw한다. */
    static fromYmd(year: number, month: number, day: number): Lunar;
    getYear(): number;
    /** 음수이면 윤달(예: -8 = 윤8월). */
    getMonth(): number;
    getDay(): number;
    getSolar(): Solar;
  }

  export class LunarYear {
    static fromYear(year: number): LunarYear;
    /** 그 해의 윤달 월(1~12), 윤달이 없으면 0. */
    getLeapMonth(): number;
  }

  export class LunarMonth {
    /** month이 음수이면 윤달을 의미한다. 존재하지 않는 (년,월) 조합이면 null. */
    static fromYm(year: number, month: number): LunarMonth | null;
    getDayCount(): number;
  }
}
