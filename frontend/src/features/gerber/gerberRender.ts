/**
 * 거버 zip 을 브라우저에서 읽어 SVG 로 그린다 (서버는 zip 을 보관·전달만 한다).
 * zip 안의 파일을 풀고 → 거버/드릴 파일만 골라 → 레이어 종류를 알아내 → 레이어별 SVG 와 실물처럼 색을 입힌 위/아래 보드 SVG 를 만든다.
 * 큰 라이브러리(@tracespace/core, fflate)는 이 함수를 처음 부를 때만 내려받는다.
 */
export interface GerberLayer {
  id: string;
  filename: string;
  /** copper · soldermask · silkscreen · solderpaste · drill · outline · drawing ... */
  type: string;
  /** top · bottom · inner · all */
  side: string;
  /** 레이어 하나의 SVG (viewBox 는 보드 전체와 같다) */
  svg: string;
}

export interface GerberRender {
  layers: GerberLayer[];
  /** [x, y, 너비, 높이] (mm). 레이어를 겹칠 때 모두 같은 좌표계를 쓴다 */
  viewBox: [number, number, number, number];
  /** 실물처럼 색을 입힌 위/아래 면 SVG (그릴 수 없으면 null) */
  boardTop: string | null;
  boardBottom: string | null;
  /** 거버·드릴 파일이 아니어서 건너뛴 파일 이름 */
  skipped: string[];
}

const MAX_FILE_BYTES = 30 * 1024 * 1024;
const GERBER_HINT = /%FS|%MO|%AD|G04|G54|G70|G71|G75|D0[123]\*|M02\*|M00\*/;
const DRILL_HINT = /M48|METRIC|INCH|T\d+C[\d.]+|FMAT/i;

/** 파일 앞부분을 보고 거버(RS-274X)나 드릴(Excellon)처럼 보이는지 가린다 (readme·PDF·그림 같은 것을 거른다) */
export function looksLikeGerber(bytes: Uint8Array): boolean {
  const head = new TextDecoder("latin1").decode(bytes.subarray(0, 4096));
  if (/[\x00-\x08\x0e-\x1f]/.test(head)) return false; // 바이너리
  return GERBER_HINT.test(head) || DRILL_HINT.test(head);
}

function baseName(path: string): string {
  const parts = path.replace(/\\/g, "/").split("/");
  return parts[parts.length - 1] || path;
}

/** 레이어 SVG 의 여는 태그에서 mm 크기를 빼고 x/y/너비/높이를 viewBox 와 같게 맞춘다 (한 SVG 안에 겹쳐 넣기 위해) */
export function fitLayerSvg(svg: string, vb: [number, number, number, number]): string {
  const end = svg.indexOf(">");
  if (end < 0) return svg;
  const open = svg.slice(0, end).replace(/\s(width|height|x|y)="[^"]*"/g, "");
  return `${open} x="${vb[0]}" y="${vb[1]}" width="${vb[2]}" height="${vb[3]}"${svg.slice(end)}`;
}

function parseViewBox(svg: string): [number, number, number, number] | null {
  const m = /viewBox="([-\d.eE+ ]+)"/.exec(svg);
  if (!m) return null;
  const n = m[1].trim().split(/\s+/).map(Number);
  return n.length === 4 && n.every(Number.isFinite) && n[2] > 0 && n[3] > 0 ? [n[0], n[1], n[2], n[3]] : null;
}

/** 라이브러리가 만든 SVG 에 스크립트나 이벤트가 섞여 있지 않은지 확인한다 (그려 넣기 전 마지막 안전장치) */
export function isSafeSvg(svg: string): boolean {
  return !/<script|<foreignObject|\son\w+\s*=|javascript:/i.test(svg);
}

/**
 * 라이브러리가 종류를 못 알아본 파일(예: DIAG_UPS_R2_Copper_Signal_Bot.gbr)은 파일 이름으로 종류·면을 추정한다.
 * 이름으로도 모르면 그대로 두고, 도면(drawing)은 처음에 꺼 둔다 (면 구분이 없는 레이어가 보드 위를 덮어 회색 판으로 보이는 것을 막는다).
 */
export function classifyByName(filename: string, type: string, side: string): { type: string; side: string } {
  const n = filename.toLowerCase();
  if (/drillmap|drill_map|drawing/.test(n)) return { type: "drawing", side: "none" };
  if (/profile|outline|edge/.test(n)) return { type: "outline", side: "all" };
  // 파일 이름에 종류가 분명히 적혀 있으면 이름을 먼저 믿는다 (라이브러리가 Legend·Soldermask 를 동박으로 잘못 알아보는 경우가 있다)
  let t: string | null = null;
  if (/solder_?mask|soldermask|mask/.test(n)) t = "soldermask";
  else if (/paste/.test(n)) t = "solderpaste";
  else if (/legend|silk/.test(n)) t = "silkscreen";
  else if (/copper|signal|plane|cu/.test(n)) t = "copper";
  const s = /(^|[^a-z])(bot|bottom|back)([^a-z]|$)/.test(n) ? "bottom" : /(^|[^a-z])(top|front)([^a-z]|$)/.test(n) ? "top" : side === "top" || side === "bottom" || side === "inner" ? side : null;
  if (t && s) return { type: t, side: s };
  if (type === "outline" || type === "drill") return { type, side };
  if (type !== "drawing" && side !== "all") return { type, side };
  return { type: "drawing", side: "none" };
}

/** 극성이 한 번이라도 clear 로 바뀌는 파일을 극성 구간별 트리로 나눈다 (없으면 null). 구간 밖의 그리기 명령은 위치만 옮기는 move 로 바꿔 좌표 흐름은 유지한다 */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export function splitByPolarity<T extends { children: any[] }>(tree: T): { polarity: string; tree: T }[] | null {
  if (!tree.children.some((n) => n.type === "loadPolarity" && n.polarity === "clear")) return null;
  const owner: number[] = [];
  const pieces: string[] = ["dark"];
  let cur = 0;
  tree.children.forEach((n, i) => {
    if (n.type === "loadPolarity") {
      const next = n.polarity === "clear" ? "clear" : "dark";
      if (next !== pieces[cur]) {
        pieces.push(next);
        cur = pieces.length - 1;
      }
    }
    owner[i] = cur;
  });
  return pieces.map((polarity, k) => ({
    polarity,
    tree: { ...tree, children: tree.children.map((n, i) => (n.type === "graphic" && owner[i] !== k ? { ...n, graphic: "move" } : n)) },
  }));
}

type HastNode = { type: string; tagName?: string; properties?: Record<string, unknown>; children?: HastNode[] };
const el = (tagName: string, properties: Record<string, unknown>, children: HastNode[]): HastNode => ({ type: "element", tagName, properties, children });

/**
 * 극성 구간별로 그린 SVG 요소를 합친다: dark 구간마다, 그 뒤에 오는 clear 구간들을 마스크로 지운다.
 * 결과는 일반 레이어 렌더와 같은 모양(루트 svg + children)이라 실물 보기(renderBoard)에도 그대로 쓰인다.
 */
export function composePolarity(id: string, pieces: { polarity: string; render: HastNode }[], vb: [number, number, number, number]): HastNode {
  const [x, y, w, h] = vb;
  const defs: HastNode[] = [];
  const body: HastNode[] = [];
  pieces.forEach((p, k) => {
    if (p.polarity !== "dark") return;
    const later = pieces.slice(k + 1).filter((q) => q.polarity === "clear");
    if (later.length === 0) {
      body.push(...(p.render.children ?? []));
      return;
    }
    const mid = `${id}m${k}`;
    defs.push(
      el("mask", { id: mid }, [
        el("rect", { x, y, width: w, height: h, fill: "#fff" }, []),
        el("g", { color: "#000" }, later.flatMap((q) => q.render.children ?? [])),
      ]),
    );
    body.push(el("g", { mask: `url(#${mid})` }, p.render.children ?? []));
  });
  const root = pieces[0].render;
  return { ...root, children: [...(defs.length ? [el("defs", {}, defs)] : []), ...body] };
}

export async function renderGerberZip(bytes: ArrayBuffer): Promise<GerberRender> {
  const [{ unzipSync }, core] = await Promise.all([import("fflate"), import("@tracespace/core")]);
  let entries: Record<string, Uint8Array>;
  try {
    entries = unzipSync(new Uint8Array(bytes), { filter: (f) => !f.name.endsWith("/") && !f.name.startsWith("__MACOSX/") && f.originalSize <= MAX_FILE_BYTES });
  } catch {
    throw new Error("zip 파일을 열 수 없습니다. 파일이 손상되었는지 확인해 주세요.");
  }
  const files: File[] = [];
  const skipped: string[] = [];
  for (const [path, data] of Object.entries(entries)) {
    const name = baseName(path);
    if (data.length > 0 && looksLikeGerber(data)) files.push(new File([data as BlobPart], name));
    else skipped.push(name);
  }
  if (files.length === 0) throw new Error("zip 안에서 거버 파일을 찾지 못했습니다.");

  // 파일 하나라도 형식을 못 알아보면(.gbrjob 같은 보조 파일 등) 전체가 실패하므로, 그때는 하나씩 읽어 보고 읽히는 파일만 쓴다
  let readResult;
  try {
    readResult = await core.read(files);
  } catch {
    const usable: File[] = [];
    for (const f of files) {
      try {
        await core.read([f]);
        usable.push(f);
      } catch {
        skipped.push(f.name);
      }
    }
    if (usable.length === 0) throw new Error("zip 안에서 읽을 수 있는 거버 파일을 찾지 못했습니다.");
    readResult = await core.read(usable);
  }
  // tracespace 는 레이어 안의 극성(%LPC*% = 지우기)을 무시하므로, 동박 면에 뚫린 구멍·간격이 사라진다.
  // 그래서 극성이 바뀌는 파일은 극성 구간마다 따로 그려 두었다가 마스크로 지운다.
  // 종류를 못 알아본 파일은 이름으로 추정한 값을 라이브러리 쪽 레이어에도 반영한다 (실물 보기와 외곽선 판정이 같은 값을 쓰도록)
  for (const layer of readResult.layers) {
    const c = classifyByName(layer.filename, String(layer.type ?? "drawing"), String(layer.side ?? "all"));
    (layer as { type: string; side: string }).type = c.type;
    (layer as { type: string; side: string }).side = c.side;
  }
  const polarityPieces: Record<string, { polarity: string; id: string }[]> = {};
  const extraLayers: typeof readResult.layers = [];
  const extraTrees: Record<string, (typeof readResult.parseTreesById)[string]> = {};
  for (const layer of readResult.layers) {
    const pieces = splitByPolarity(readResult.parseTreesById[layer.id]);
    if (!pieces) continue;
    polarityPieces[layer.id] = pieces.map((p, i) => {
      const pid = `${layer.id}p${i}`;
      extraLayers.push({ ...layer, id: pid });
      extraTrees[pid] = p.tree;
      return { polarity: p.polarity, id: pid };
    });
  }
  const plotResult = core.plot({ layers: [...readResult.layers, ...extraLayers], parseTreesById: { ...readResult.parseTreesById, ...extraTrees } });
  const rendered = core.renderLayers(plotResult);
  for (const [lid, pieces] of Object.entries(polarityPieces)) {
    const first = rendered.rendersById[lid] as unknown as { properties?: { viewBox?: string } };
    const vbox = (String(first.properties?.viewBox ?? "0 -100 100 100").trim().split(/\s+/).map(Number) as [number, number, number, number]);
    rendered.rendersById[lid] = composePolarity(lid, pieces.map((p) => ({ polarity: p.polarity, render: rendered.rendersById[p.id] as unknown as HastNode })), vbox) as unknown as (typeof rendered.rendersById)[string];
  }
  const svgs = readResult.layers.map((layer) => ({ layer, svg: core.stringifySvg(rendered.rendersById[layer.id]) })).filter((x) => isSafeSvg(x.svg));
  if (svgs.length === 0) throw new Error("거버 파일을 그릴 수 없습니다. 파일 형식을 확인해 주세요.");

  const vb = parseViewBox(svgs[0].svg) ?? [0, -100, 100, 100];
  let boardTop: string | null = null;
  let boardBottom: string | null = null;
  try {
    const board = core.renderBoard(rendered);
    const top = core.stringifySvg(board.top);
    const bottom = core.stringifySvg(board.bottom);
    boardTop = isSafeSvg(top) ? top : null;
    boardBottom = isSafeSvg(bottom) ? bottom : null;
  } catch {
    // 외곽선이 없는 등 실물 모양을 만들 수 없는 거버: 레이어로만 본다
  }
  return {
    layers: svgs.map(({ layer, svg }) => {
      const byName = classifyByName(layer.filename, String(layer.type ?? "drawing"), String(layer.side ?? "all"));
      return { id: layer.id, filename: layer.filename, type: byName.type, side: byName.side, svg: fitLayerSvg(svg, vb) };
    }),
    viewBox: vb,
    boardTop,
    boardBottom,
    skipped,
  };
}

/** 레이어 겹치는 순서: 아래에 깔릴수록 작다 */
const TYPE_ORDER: Record<string, number> = { solderpaste: 0, soldermask: 1, copper: 2, silkscreen: 3, drill: 4, outline: 5 };
export const layerOrder = (l: Pick<GerberLayer, "type" | "side">): number => (l.side === "bottom" ? 0 : l.side === "inner" ? 100 : 200) + (TYPE_ORDER[l.type] ?? 6);

const TYPE_LABEL: Record<string, string> = { copper: "동박", soldermask: "솔더마스크", silkscreen: "실크", solderpaste: "솔더페이스트", drill: "드릴", outline: "외곽선", drawing: "도면" };
const SIDE_LABEL: Record<string, string> = { top: "Top", bottom: "Bottom", inner: "내층", all: "" };
export const layerLabel = (l: Pick<GerberLayer, "type" | "side">): string => [SIDE_LABEL[l.side] ?? "", TYPE_LABEL[l.type] ?? "기타"].filter(Boolean).join(" ");

/** 레이어 색 (어두운 배경 위에서 잘 보이는 색) */
export function layerColor(l: Pick<GerberLayer, "type" | "side">): string {
  // KiCad 기본 색
  const bot = l.side === "bottom";
  if (l.type === "copper") return bot ? "#4d7fc4" : l.side === "inner" ? "#7fc87f" : "#c83434";
  if (l.type === "soldermask") return bot ? "#02ffee" : "#840084";
  if (l.type === "silkscreen") return bot ? "#e8b2a7" : "#f2eda1";
  if (l.type === "drill") return "#ff6b6b";
  if (l.type === "outline") return "#d0d2cd";
  if (l.type === "solderpaste") return bot ? "#00c2c2" : "#b4a09d";
  return "#c0c6cc";
}

/** 보이는 레이어들을 하나의 SVG 로 겹친다 */
export function composeLayers(render: GerberRender, visibleIds: ReadonlySet<string>): string {
  const [x, y, w, h] = render.viewBox;
  const inner = [...render.layers]
    .filter((l) => visibleIds.has(l.id))
    .sort((a, b) => layerOrder(a) - layerOrder(b))
    .map((l) => `<g color="${layerColor(l)}" opacity="${l.type === "soldermask" ? 0.45 : 0.95}">${l.svg}</g>`)
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${x} ${y} ${w} ${h}">${inner}</svg>`;
}

/** 처음에 켜 둘 레이어: 위 면 + 양쪽 공통(외곽선·드릴) */
export function defaultVisible(layers: GerberLayer[]): Set<string> {
  return new Set(layers.filter((l) => l.side === "top" || l.side === "all").map((l) => l.id));
}
