import fs from "node:fs";
import os from "node:os";
import path from "node:path";

import { describe, expect, it } from "vitest";

import { checkHealth, classifySender, decideWindowOpen, isAllowedNavigation, loadConfig, loadDefaultServer, normalizeServerUrl, saveConfig } from "./serverConfig";

const SHELL = path.join("C:\\", "app", "renderer", "shell.html");

describe("normalizeServerUrl", () => {
  it.each([
    ["192.168.0.10", "http://192.168.0.10"],
    ["http://192.168.0.10/", "http://192.168.0.10"],
    ["  http://erp.local:8080/some/path?x=1#y ", "http://erp.local:8080"],
    ["https://erp.bench.co.kr", "https://erp.bench.co.kr"],
    ["HTTP://ERP.Local", "http://erp.local"],
  ])("%s → %s", (input, expected) => {
    expect(normalizeServerUrl(input)).toEqual({ ok: true, url: expected });
  });

  it.each(["", "   ", "ftp://x.com", "javascript:alert(1)", "file:///C:/x", "http://user:pw@host", "http://"])("거절: %j", (input) => {
    expect(normalizeServerUrl(input).ok).toBe(false);
  });
});

describe("classifySender / isAllowedNavigation", () => {
  const server = "http://192.168.0.10";
  const shellUrl = "file:///C:/app/renderer/shell.html?mode=setup";

  it("서버 화면과 안내 화면을 구분한다", () => {
    expect(classifySender("http://192.168.0.10/payments", server, SHELL)).toBe("server");
    expect(classifySender(shellUrl, server, SHELL)).toBe("shell");
  });

  it("다른 주소는 모두 거절", () => {
    expect(classifySender("http://evil.example/", server, SHELL)).toBeNull();
    expect(classifySender("http://192.168.0.10:8000/", server, SHELL)).toBeNull(); // 포트가 다르면 다른 origin
    expect(classifySender("https://192.168.0.10/", server, SHELL)).toBeNull();
    expect(classifySender("http://192.168.0.10.evil.com/", server, SHELL)).toBeNull();
    expect(classifySender("file:///C:/other/page.html", server, SHELL)).toBeNull();
    expect(classifySender("not a url", server, SHELL)).toBeNull();
    expect(classifySender("", server, SHELL)).toBeNull();
  });

  it("서버가 아직 설정되지 않았으면 안내 화면만", () => {
    expect(classifySender("http://192.168.0.10/", undefined, SHELL)).toBeNull();
    expect(classifySender(shellUrl, undefined, SHELL)).toBe("shell");
  });

  it("이동 허용 여부", () => {
    expect(isAllowedNavigation("http://192.168.0.10/clients", server, SHELL)).toBe(true);
    expect(isAllowedNavigation("https://example.com/", server, SHELL)).toBe(false);
  });
});

describe("config 파일", () => {
  const tmp = () => fs.mkdtempSync(path.join(os.tmpdir(), "bench-cfg-"));

  it("저장했다 읽는다", () => {
    const file = path.join(tmp(), "sub", "config.json");
    saveConfig(file, { serverUrl: "http://10.0.0.5", nfcPort: "COM5" });
    expect(loadConfig(file)).toEqual({ serverUrl: "http://10.0.0.5", nfcPort: "COM5" });
  });

  it("파일이 없거나 깨졌으면 빈 설정", () => {
    const dir = tmp();
    expect(loadConfig(path.join(dir, "none.json"))).toEqual({});
    fs.writeFileSync(path.join(dir, "bad.json"), "{not json");
    expect(loadConfig(path.join(dir, "bad.json"))).toEqual({});
  });

  it("화면 배율을 저장했다 읽고, 이상한 값·100%는 저장하지 않는다", () => {
    const file = path.join(tmp(), "config.json");
    saveConfig(file, { zoomFactor: 1.25 });
    expect(loadConfig(file)).toEqual({ zoomFactor: 1.25 });
    for (const bad of [9, 0, -1, "1.5", 1]) {
      fs.writeFileSync(file, JSON.stringify({ zoomFactor: bad }));
      expect(loadConfig(file), String(bad)).toEqual({});
    }
  });

  it("파일에 이상한 주소가 있으면 버린다", () => {
    const file = path.join(tmp(), "config.json");
    fs.writeFileSync(file, JSON.stringify({ serverUrl: "javascript:alert(1)", nfcPort: 5 }));
    expect(loadConfig(file)).toEqual({});
  });
});

describe("checkHealth", () => {
  const ok = (async () => new Response("{}", { status: 200 })) as typeof fetch;

  it("정상 응답", async () => {
    expect(await checkHealth("http://x", 100, ok)).toEqual({ ok: true });
  });
  it("HTTP 오류", async () => {
    const r = await checkHealth("http://x", 100, (async () => new Response("", { status: 502 })) as typeof fetch);
    expect(r).toMatchObject({ ok: false });
    expect((r as { error: string }).error).toContain("502");
  });
  it("연결 실패", async () => {
    const r = await checkHealth("http://x", 100, (async () => { throw new TypeError("fetch failed"); }) as typeof fetch);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("연결할 수 없습니다") });
  });
  it("시간 초과", async () => {
    const slow = ((_u: string, init?: RequestInit) => new Promise((_res, rej) => init?.signal?.addEventListener("abort", () => rej(init.signal?.reason)))) as unknown as typeof fetch;
    const r = await checkHealth("http://x", 20, slow);
    expect(r).toMatchObject({ ok: false, error: expect.stringContaining("시간 초과") });
  });
});

describe("decideWindowOpen", () => {
  const server = "http://www.epik.bio:3102";
  it.each([
    ["blob:http://www.epik.bio:3102/3f1c-uuid", "app-window"], // PDF·이미지 열기
    ["http://www.epik.bio:3102/api/files/1", "app-window"],
    ["mailto:a@b.com?subject=%EA%B2%AC%EC%A0%81%EC%84%9C", "external"],
    ["tel:0212345678", "external"],
    ["https://www.popbill.com/view?x=1", "external"],
    ["http://other.example/", "external"],
    ["http://www.epik.bio:9999/", "external"], // 포트가 다르면 다른 사이트
    ["blob:https://evil.example/uuid", "deny"],
    ["file:///C:/Windows/win.ini", "deny"],
    ["javascript:alert(1)", "deny"],
    ["data:text/html,<script>1</script>", "deny"],
    ["about:blank", "deny"],
    ["", "deny"],
    ["not a url", "deny"],
  ])("%s → %s", (url, expected) => {
    expect(decideWindowOpen(url, server)).toBe(expected);
  });

  it("서버 주소가 없으면 같은 서버로 볼 수 없다", () => {
    expect(decideWindowOpen("blob:http://www.epik.bio:3102/x", undefined)).toBe("deny");
    expect(decideWindowOpen("http://www.epik.bio:3102/", undefined)).toBe("external");
  });
});

describe("loadDefaultServer (설치 파일에 들어 있는 기본 서버 주소)", () => {
  const tmpFile = (content?: string) => {
    const file = path.join(fs.mkdtempSync(path.join(os.tmpdir(), "bench-def-")), "default-server.json");
    if (content !== undefined) fs.writeFileSync(file, content);
    return file;
  };

  it("올바른 주소는 origin 으로 정리해 돌려준다", () => {
    expect(loadDefaultServer(tmpFile(JSON.stringify({ serverUrl: "www.epik.bio:3102/some/path" })))).toBe("http://www.epik.bio:3102");
    expect(loadDefaultServer(tmpFile(JSON.stringify({ serverUrl: "https://erp.bench.co.kr" })))).toBe("https://erp.bench.co.kr");
  });

  it("파일이 없거나 깨졌거나 주소가 이상하면 undefined (직접 입력하게 한다)", () => {
    expect(loadDefaultServer(tmpFile())).toBeUndefined();
    expect(loadDefaultServer(tmpFile("{not json"))).toBeUndefined();
    expect(loadDefaultServer(tmpFile(JSON.stringify({})))).toBeUndefined();
    expect(loadDefaultServer(tmpFile(JSON.stringify({ serverUrl: 5 })))).toBeUndefined();
    expect(loadDefaultServer(tmpFile(JSON.stringify({ serverUrl: "javascript:alert(1)" })))).toBeUndefined();
    expect(loadDefaultServer(tmpFile(JSON.stringify({ serverUrl: "ftp://x.com" })))).toBeUndefined();
  });
});
