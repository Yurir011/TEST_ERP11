// 설치 파일에 기본 서버 주소를 넣는다: 설치한 직원이 서버 주소를 직접 입력하지 않아도 되게 한다.
// 주소는 다음 순서로 정한다.
//   1. 환경변수 BENCH_DEFAULT_SERVER (다른 서버용 설치 파일을 만들 때)   예) set BENCH_DEFAULT_SERVER=http://192.168.0.10 && npm run dist
//   2. package.json 의 "benchDefaultServer" (평소 배포용 주소)
//   3. 둘 다 없으면 넣지 않는다 → 설치 후 처음 실행할 때 직원이 입력
// 결과는 build-resources/default-server.json 으로 쓰이고 설치 파일(resources)에 함께 들어간다.
const fs = require("node:fs");
const path = require("node:path");
const { normalizeServerUrl } = require("../dist/serverConfig");

const desktop = path.join(__dirname, "..");
const file = path.join(desktop, "build-resources", "default-server.json");
fs.mkdirSync(path.dirname(file), { recursive: true });

const pkg = JSON.parse(fs.readFileSync(path.join(desktop, "package.json"), "utf-8"));
const fromEnv = process.env.BENCH_DEFAULT_SERVER;
const input = fromEnv || pkg.benchDefaultServer;
const source = fromEnv ? "환경변수 BENCH_DEFAULT_SERVER" : "package.json benchDefaultServer";

if (!input) {
  fs.rmSync(file, { force: true });
  console.log("[dist] 기본 서버 주소 없음: 설치 후 처음 실행할 때 직원이 입력합니다.");
} else {
  const check = normalizeServerUrl(input);
  if (!check.ok) {
    console.error(`[dist] ${source} 가 올바르지 않습니다: ${check.error}`);
    process.exit(1);
  }
  fs.writeFileSync(file, JSON.stringify({ serverUrl: check.url }), "utf-8");
  console.log(`[dist] 기본 서버 주소: ${check.url} (${source})`);
}
