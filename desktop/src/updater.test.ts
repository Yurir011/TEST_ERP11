import crypto from "node:crypto";
import fs from "node:fs";
import http from "node:http";
import type { AddressInfo } from "node:net";
import os from "node:os";
import path from "node:path";

import { afterEach, describe, expect, it } from "vitest";

import { INSTALLER_ARGS, type PublicRelease, SETUP_NAME, checkForUpdate, downloadInstaller, parsePublicRelease } from "./updater";

const MB = 1024 * 1024;
const FAKE_EXE = Buffer.concat([Buffer.from("MZ"), Buffer.alloc(2 * MB, 7)]);
const sha = (b: Buffer) => crypto.createHash("sha256").update(b).digest("hex");

interface Fake {
  url: string;
  close: () => Promise<void>;
  hits: string[];
}

/** 가짜 서버: latest 정보와 설치 파일 내용을 정해 둔다 */
async function startServer(opts: { latest?: unknown; body?: Buffer; status?: number; cutAfter?: number; redirect?: boolean }): Promise<Fake> {
  const hits: string[] = [];
  const server = http.createServer((req, res) => {
    hits.push(req.url ?? "");
    if (req.url === "/api/client/public/latest") {
      res.setHeader("Content-Type", "application/json");
      res.end(JSON.stringify(opts.latest ?? null));
    } else if (req.url === "/real.exe") {
      res.end(FAKE_EXE);
    } else if (req.url === "/api/client/public/download") {
      if (opts.redirect) {
        res.statusCode = 302; // 다른 곳으로 돌리는 응답 (바꿔치기 시도)
        res.setHeader("Location", "/real.exe");
        res.end();
        return;
      }
      res.statusCode = opts.status ?? 200;
      const body = opts.body ?? FAKE_EXE;
      res.setHeader("Content-Length", String(body.length));
      if (opts.cutAfter !== undefined) {
        res.write(body.subarray(0, opts.cutAfter));
        res.destroy(); // 중간에 연결이 끊긴다
        return;
      }
      res.end(body);
    } else {
      res.statusCode = 404;
      res.end();
    }
  });
  await new Promise<void>((r) => server.listen(0, "127.0.0.1", r));
  return { url: `http://127.0.0.1:${(server.address() as AddressInfo).port}`, hits, close: () => new Promise<void>((r) => server.close(() => r())) };
}

const release = (over: Partial<PublicRelease> = {}): PublicRelease => ({ version: "0.71.7", display: "V.0.71.007", filename: "BENCH-ERP_Setup_0.71.007.exe", size: FAKE_EXE.length, sha256: sha(FAKE_EXE), ...over });

let server: Fake | null = null;
afterEach(async () => {
  await server?.close();
  server = null;
});
const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "bench-update-"));

describe("서버가 알려 준 새 버전 정보 검사", () => {
  it("올바른 값은 받고 해시는 소문자로 정리한다", () => {
    expect(parsePublicRelease({ ...release(), sha256: sha(FAKE_EXE).toUpperCase() })?.sha256).toBe(sha(FAKE_EXE));
    expect(parsePublicRelease({ ...release(), sha256: undefined })?.sha256).toBeUndefined();
    expect(parsePublicRelease({ ...release(), sha256: "xyz" })?.sha256).toBeUndefined(); // 이상한 해시는 없는 것으로
  });

  it("파일 이름·크기·형식이 이상하면 거절한다", () => {
    const bad: unknown[] = [
      null,
      "x",
      { ...release(), filename: "../evil.exe" },
      { ...release(), filename: "BENCH-ERP_Setup_0.71.7.exe.bat" },
      { ...release(), filename: "calc.exe" },
      { ...release(), size: 10 },
      { ...release(), size: 2 * 1024 * MB },
      { ...release(), size: "100" },
      { ...release(), version: 5 },
    ];
    for (const v of bad) expect(parsePublicRelease(v), JSON.stringify(v)?.slice(0, 60)).toBeNull();
  });

  it("두 가지 설치 파일 이름 형식을 모두 받는다", () => {
    expect(SETUP_NAME.test("BENCH-ERP_Setup_0.71.6.exe")).toBe(true);
    expect(SETUP_NAME.test("BENCH-ERP_Setup_0.71.006.exe")).toBe(true);
    expect(SETUP_NAME.test("BENCH-ERP_V.0.71.006_Setup.exe")).toBe(true);
    expect(SETUP_NAME.test("BENCH-ERP_Setup_0.71.6.exe ")).toBe(false);
  });
});

describe("새 버전 확인", () => {
  it("더 높은 버전이 있으면 newer", async () => {
    server = await startServer({ latest: release() });
    expect(await checkForUpdate(server.url, "0.71.6")).toMatchObject({ ok: true, newer: true });
  });

  it("같거나 낮은 버전, 올라온 파일이 없는 경우는 newer 가 아니다", async () => {
    server = await startServer({ latest: release() });
    expect(await checkForUpdate(server.url, "0.71.7")).toMatchObject({ ok: true, newer: false });
    expect(await checkForUpdate(server.url, "0.72.0")).toMatchObject({ ok: true, newer: false });
    await server.close();
    server = await startServer({ latest: null });
    expect(await checkForUpdate(server.url, "0.71.6")).toMatchObject({ ok: true, latest: null, newer: false });
  });

  it("서버에 연결할 수 없으면 오류로 알린다", async () => {
    server = await startServer({});
    const url = server.url;
    await server.close();
    server = null;
    expect((await checkForUpdate(url, "0.71.6")).ok).toBe(false);
  });
});

describe("설치 파일 받기·검사", () => {
  it("받아서 크기·MZ·해시를 확인하고 저장한다 (진행률 포함)", async () => {
    server = await startServer({});
    const ratios: number[] = [];
    const dir = tmp();
    const r = await downloadInstaller(server.url, release(), dir, (x) => ratios.push(x));
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(path.basename(r.file)).toBe("BENCH-ERP_Setup_0.71.007.exe");
      expect(fs.readFileSync(r.file).equals(FAKE_EXE)).toBe(true);
    }
    expect(ratios.at(-1)).toBe(1);
    expect(fs.readdirSync(dir).filter((f) => f.endsWith(".part"))).toEqual([]);
  });

  it("해시가 다르면(손상·바꿔치기) 거절하고 받은 파일을 지운다", async () => {
    server = await startServer({});
    const dir = tmp();
    const r = await downloadInstaller(server.url, release({ sha256: "0".repeat(64) }), dir);
    expect(r.ok).toBe(false);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("실행 파일 머리말(MZ)이 없으면 거절한다", async () => {
    const body = Buffer.concat([Buffer.from("PK"), Buffer.alloc(2 * MB)]);
    server = await startServer({ body });
    const dir = tmp();
    const r = await downloadInstaller(server.url, release({ size: body.length, sha256: undefined }), dir);
    expect(r.ok).toBe(false);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("서버가 알려 준 크기와 다르면(모자라거나 넘치면) 거절한다", async () => {
    server = await startServer({});
    for (const size of [FAKE_EXE.length + 10, FAKE_EXE.length - 10]) {
      const dir = tmp();
      const r = await downloadInstaller(server.url, release({ size, sha256: undefined }), dir);
      expect(r.ok, String(size)).toBe(false);
      expect(fs.readdirSync(dir)).toEqual([]);
    }
  });

  it("중간에 연결이 끊기면 거절하고 임시 파일을 남기지 않는다", async () => {
    server = await startServer({ cutAfter: MB });
    const dir = tmp();
    const r = await downloadInstaller(server.url, release(), dir);
    expect(r.ok).toBe(false);
    expect(fs.readdirSync(dir)).toEqual([]);
  });

  it("다른 곳으로 돌리는(리다이렉트) 응답은 따라가지 않고 거절한다", async () => {
    server = await startServer({ redirect: true });
    const r = await downloadInstaller(server.url, release(), tmp());
    expect(r.ok).toBe(false);
    expect(server.hits).not.toContain("/real.exe");
  });

  it("서버 오류(404 등)는 이유와 함께 거절한다", async () => {
    server = await startServer({ status: 404 });
    const r = await downloadInstaller(server.url, release(), tmp());
    expect(r.ok).toBe(false);
  });

  it("이름이 이상한 설치 파일 정보로는 받지 않는다 (서버에 요청도 가지 않는다)", async () => {
    server = await startServer({});
    const r = await downloadInstaller(server.url, release({ filename: "..\\evil.exe" }), tmp());
    expect(r.ok).toBe(false);
    expect(server.hits).toEqual([]);
  });
});

describe("설치 프로그램 실행 인자", () => {
  it("조용히 설치하고 끝나면 앱을 다시 켠다", () => {
    expect([...INSTALLER_ARGS]).toEqual(["/S", "--force-run", "--updated"]);
  });
});
