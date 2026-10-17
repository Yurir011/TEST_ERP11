// electron 을 실행한다. 일부 PC 에는 환경변수 ELECTRON_RUN_AS_NODE=1 이 설정돼 있어 electron 이 앱이 아니라 Node 로 실행되므로 지우고 띄운다.
const { spawn } = require("node:child_process");
const electron = require("electron"); // electron 패키지는 실행 파일 경로를 돌려준다

const env = { ...process.env };
delete env.ELECTRON_RUN_AS_NODE;

const child = spawn(electron, process.argv.slice(2), { stdio: "inherit", env });
child.on("exit", (code) => process.exit(code ?? 0));
