// electron 을 실행한다. 일부 PC 에는 환경변수 ELECTRON_RUN_AS_NODE=1 이 설정돼 있어 electron 이 앱이 아니라 Node 로 실행되므로 지우고 띄운다.
const { spawn } = require("node:child_process");
const electron = require("electron"); // electron 패키지는 실행 파일 경로를 돌려준다

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

// --local: 개발 PC 의 서버(http://localhost:5173)에 붙는다. 설정·기기 키를 따로 저장해 운영 서버용 설정과 섞이지 않는다.
const args = process.argv.slice(2);
const local = args.includes("--local");
if (local) {
  env.BENCH_SERVER_URL = "http://localhost:5173";
  env.BENCH_USER_DATA = require("node:path").join(process.env.APPDATA || require("node:os").homedir(), "bench-desktop-local");
}

const child = spawn(electron, args.filter((a) => a !== "--local"), { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
