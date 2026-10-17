/**
 * 만들어진 설치 파일(release/)을 서버가 직원에게 내려줄 폴더로 복사하고, 최신 버전 정보(latest.json)를 적는다.
 * 직원 PC 의 앱은 로그인한 뒤 서버의 최신 버전을 확인하고, 더 새 버전이면 안내와 [다운로드] 버튼을 보여 준다.
 *
 *   cd desktop
 *   npm run publish-release -- --notes "바뀐 내용"
 *   npm run publish-release -- --dir D:\erp\storage\client_releases   # 서버 폴더가 다른 위치일 때
 *
 * 기본 대상: backend/storage/client_releases (백업 스크립트 --with-files 에 함께 들어간다)
 */
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";

import { buildLatestJson, builtInstallerName, publishedInstallerName } from "../src/release";
import { parseVersion } from "../src/version";

const desktop = path.join(__dirname, "..");
const args = process.argv.slice(2);
const valueOf = (flag: string) => {
  const i = args.indexOf(flag);
  return i >= 0 ? args[i + 1] : undefined;
};

const pkgVersion = (JSON.parse(fs.readFileSync(path.join(desktop, "package.json"), "utf-8")) as { version: string }).version;
const version = parseVersion(pkgVersion);
if (!version) {
  console.error(`[배포] package.json 의 버전을 해석할 수 없습니다: ${pkgVersion}`);
  process.exit(1);
}

const source = path.join(desktop, "release", builtInstallerName(pkgVersion));
if (!fs.existsSync(source)) {
  console.error(`[배포] 설치 파일이 없습니다: ${source}\n  먼저 npm run dist 로 설치 파일을 만드세요.`);
  process.exit(1);
}

const targetDir = path.resolve(valueOf("--dir") ?? path.join(desktop, "..", "backend", "storage", "client_releases"));
fs.mkdirSync(targetDir, { recursive: true });
const target = path.join(targetDir, publishedInstallerName(version));
fs.copyFileSync(source, target);

const data = fs.readFileSync(target);
const sha256 = crypto.createHash("sha256").update(data).digest("hex");
const latest = buildLatestJson(version, data.length, sha256, valueOf("--notes") ?? "", new Date());
fs.writeFileSync(path.join(targetDir, "latest.json"), JSON.stringify(latest, null, 2), "utf-8");

console.log(`[배포] ${latest.display} 을(를) 올렸습니다.`);
console.log(`  설치 파일: ${target} (${(data.length / 1024 / 1024).toFixed(1)}MB)`);
console.log(`  SHA-256: ${sha256}`);
console.log(`  안내 정보: ${path.join(targetDir, "latest.json")}`);
