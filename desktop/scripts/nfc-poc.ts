/**
 * 0단계 PoC: PN532(CH340, 115200bps)로 카드 UID 를 읽어 화면에 보여 준다.
 *
 *   npm run poc                 카드를 대면 UID 를 출력 (Ctrl+C 로 종료)
 *   npm run poc -- --init-only  리더 준비(펌웨어 확인)까지만 하고 종료 — 카드 없이 연결만 확인할 때
 *   NFC_PORT=COM5 npm run poc   포트를 직접 지정
 *
 * UID 는 비밀값이 아니지만 사원증 번호이므로 이 출력을 외부에 공유하지 않는다.
 */
import { getLogger } from "../src/log";
import { serialPortProvider } from "../src/nfc/port";
import { NfcReader } from "../src/nfc/reader";

const log = getLogger("NFC-PoC");
const initOnly = process.argv.includes("--init-only");

const reader = new NfcReader(serialPortProvider({ preferred: process.env.NFC_PORT, log }), { log });

reader.on("status", (s) => {
  if (s.state === "ready" && initOnly) {
    log.info(`[NFC-PoC] 연결 확인 완료: ${s.port}, 펌웨어 ${s.firmware}`);
    void reader.stop().then(() => process.exit(0));
  }
});
reader.on("card", (t) => {
  log.info(`[NFC-PoC] UID=${t.uid} (${t.uid.length / 2}바이트) ATQA=${t.atqa} SAK=0x${t.sak.toString(16).padStart(2, "0")}`);
});
reader.on("removed", (uid) => log.info(`[NFC-PoC] 카드 떨어짐 (끝 4자리 ${uid.slice(-4)})`));

process.on("SIGINT", () => void reader.stop().then(() => process.exit(0)));
if (initOnly) setTimeout(() => { log.error("[NFC-PoC] 10초 안에 준비되지 않았습니다"); process.exit(1); }, 10000);

log.info("[NFC-PoC] 시작 — 카드를 리더에 대 보세요 (Ctrl+C 종료)");
reader.start();
