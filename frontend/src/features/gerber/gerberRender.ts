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

  const readResult = await core.read(files);
  const plotResult = core.plot(readResult);
  const rendered = core.renderLayers(plotResult);
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
    layers: svgs.map(({ layer, svg }) => ({ id: layer.id, filename: layer.filename, type: String(layer.type ?? "drawing"), side: String(layer.side ?? "all"), svg: fitLayerSvg(svg, vb) })),
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
  if (l.type === "copper") return l.side === "bottom" ? "#5aa0e0" : l.side === "inner" ? "#b58ce0" : "#e0b84a";
  if (l.type === "soldermask") return l.side === "bottom" ? "#1f6f4e" : "#2f9e6a";
  if (l.type === "silkscreen") return "#f2f2f2";
  if (l.type === "drill") return "#ff6b6b";
  if (l.type === "outline") return "#e8e8e8";
  if (l.type === "solderpaste") return "#9aa3ad";
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
