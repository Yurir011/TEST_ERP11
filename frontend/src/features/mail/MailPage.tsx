import { Mail } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { useAuth } from "../../context/useAuth";
import { ALL_MAIL_FOLDER, type MailAccountInfo, type MailDetail, type MailFolder, type MailSummary, getBenchClient } from "../../lib/desktop";
import { logDebug, logError } from "../../lib/logger";
import { MailAccountForm } from "./MailAccountForm";
import { MailListView } from "./MailListView";
import { MailReader } from "./MailReader";
import { MailSidebar } from "./MailSidebar";
import { DEFAULT_PAGE_SIZE, folderLabel } from "./mailFormat";

type QuickFilter = { unread?: boolean; flagged?: boolean; attachment?: boolean };

/**
 * 메일 창 (데스크톱 앱 전용, 별도 창으로 열린다). ERP 사이드바 없이 메일 화면만 크게 보여 준다.
 * 브라우저로 이 주소를 열면 앱에서만 쓸 수 있다는 안내만 나온다.
 */
export function MailPage() {
  const bridge = getBenchClient()?.mail;

  useEffect(() => {
    document.title = "BENCH 메일";
  }, []);

  if (!bridge) {
    return (
      <div className="min-h-screen bg-bg flex items-center justify-center px-4">
        <div className="bg-surface border border-border rounded-2xl p-10 flex flex-col items-center gap-2 text-text-muted max-w-md text-center">
          <Mail size={36} />
          <p className="text-sm text-text">메일은 BENCH ERP 데스크톱 앱에서만 사용할 수 있습니다.</p>
          <p className="text-xs">앱을 설치하고 최신 버전으로 업데이트한 뒤, 앱의 사이드바에서 [메일] 버튼을 눌러 주세요.</p>
          <Link to="/" className="mt-3 text-xs text-primary hover:underline">ERP 첫 화면으로</Link>
        </div>
      </div>
    );
  }
  return <MailApp />;
}

function MailApp() {
  const bridge = getBenchClient()!.mail!;
  const { user } = useAuth();
  const dialog = useDialog();
  const [account, setAccount] = useState<MailAccountInfo | null | undefined>(undefined); // undefined = 확인 중
  const [editing, setEditing] = useState(false);
  const [folders, setFolders] = useState<MailFolder[]>([]);
  const [folder, setFolder] = useState("INBOX");
  const [filter, setFilter] = useState<QuickFilter>({});
  const [query, setQuery] = useState("");
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState<number>(DEFAULT_PAGE_SIZE);
  const [items, setItems] = useState<MailSummary[]>([]);
  const [total, setTotal] = useState(0);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [reading, setReading] = useState(false);
  const [detail, setDetail] = useState<MailDetail | null>(null);
  const [detailError, setDetailError] = useState<string | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);
  const [allowImages, setAllowImages] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [syncError, setSyncError] = useState<string | null>(null);
  const [tick, setTick] = useState(0); // 값이 바뀌면 저장된 목록을 다시 읽는다
  const detailReq = useRef(0);
  const reload = useCallback(() => setTick((t) => t + 1), []);

  // 저장된 목록(폴더·조건·검색·쪽)은 바뀔 때마다 이 PC 의 저장소에서 바로 읽는다
  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    void (async () => {
      const [fs, list] = await Promise.all([bridge.folders(), bridge.list(folder, (page - 1) * pageSize, pageSize, { ...filter, query: query || undefined })]);
      if (cancelled) return;
      setFolders(fs);
      setItems(list.items);
      setTotal(list.total);
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, account, folder, filter, query, page, pageSize, tick]);

  const syncFolder = useCallback(
    async (path: string) => {
      setSyncing(true);
      setSyncError(null);
      logDebug("Mail", `동기화 시작: ${path}`);
      try {
        const r = await bridge.sync(path);
        if (!r.ok) {
          setSyncError(r.error);
          logError("Mail", `동기화 실패: ${r.error}`);
        } else {
          logDebug("Mail", `동기화 완료: 새 ${r.value.added}건, 삭제 ${r.value.removed}건`);
        }
        reload();
      } catch (err) {
        logError("Mail", "동기화 중 오류", err);
        setSyncError("메일을 가져오지 못했습니다. 잠시 후 다시 시도해 주세요.");
      } finally {
        setSyncing(false);
      }
    },
    [bridge, reload],
  );

  // 처음 열 때: 등록된 계정을 확인하고, 있으면 저장된 메일을 보여 주면서 서버와 맞춘다
  useEffect(() => {
    let cancelled = false;
    void (async () => {
      const acc = await bridge.account();
      if (cancelled) return;
      setAccount(acc);
      if (acc) await syncFolder("INBOX");
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, syncFolder]);

  function goList() {
    setReading(false);
    setDetail(null);
    setDetailError(null);
  }

  function selectFolder(path: string) {
    setFolder(path);
    setPage(1);
    setSelected(new Set());
    goList();
    void syncFolder(path);
  }

  function toggleFilter(key: keyof QuickFilter) {
    setFilter((f) => ({ ...f, [key]: !f[key] }));
    setPage(1);
    setSelected(new Set());
    goList();
  }

  function changePage(n: number) {
    setPage(n);
    setSelected(new Set());
  }

  async function openMessage(id: number, images = false) {
    const req = ++detailReq.current;
    setReading(true);
    setLoadingDetail(true);
    setDetailError(null);
    if (!images) setAllowImages(false);
    try {
      const r = await bridge.get(id, images);
      if (req !== detailReq.current) return; // 그 사이 다른 메일을 눌렀다
      if (!r.ok) {
        setDetail(null);
        setDetailError(r.error);
        return;
      }
      setDetail(r.value);
      reload(); // 읽음으로 바뀐 것과 안 읽은 수를 반영
    } catch (err) {
      logError("Mail", "메일 열기 실패", err);
      if (req === detailReq.current) setDetailError("메일을 열지 못했습니다.");
    } finally {
      if (req === detailReq.current) setLoadingDetail(false);
    }
  }

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function markSelected(seen: boolean) {
    const ids = [...selected];
    setItems((prev) => prev.map((m) => (selected.has(m.id) ? { ...m, seen } : m)));
    await Promise.all(ids.map((id) => bridge.markSeen(id, seen)));
    setSelected(new Set());
    reload();
  }

  async function toggleStar(id: number, on: boolean) {
    setItems((prev) => prev.map((m) => (m.id === id ? { ...m, flagged: on } : m)));
    await bridge.setFlagged(id, on);
    reload();
  }

  async function attachment(kind: "open" | "save", index: number) {
    if (!detail) return;
    const r = kind === "open" ? await bridge.openAttachment(detail.id, index) : await bridge.saveAttachment(detail.id, index);
    if (!r.ok && !r.canceled) dialog.notifyError(r.error);
  }

  async function removeAccount() {
    const ok = await dialog.confirm("이 PC 에 저장된 메일 계정 정보를 삭제할까요? (서버의 메일은 지워지지 않습니다. 이 PC 에 받아 둔 메일 목록은 그대로 남습니다.)");
    if (!ok) return;
    await bridge.removeAccount();
    setAccount(null);
    setEditing(false);
  }

  if (account === undefined) return <p className="min-h-screen bg-bg p-8 text-sm text-text-muted">불러오는 중...</p>;

  if (account === null || editing) {
    return (
      <div className="min-h-screen bg-bg flex items-start justify-center px-4 py-12">
        <div className="w-full max-w-xl bg-surface border border-border rounded-2xl p-6">
          <h1 className="text-lg font-semibold mb-1">{account ? "메일 계정 변경" : "메일 계정 등록"}</h1>
          <p className="text-sm text-text-muted mb-5">회사 메일 주소와 비밀번호를 입력하면 접속을 확인한 뒤 저장합니다. 메일은 이 PC 에만 저장되고 ERP 서버로는 전송되지 않습니다.</p>
          <MailAccountForm
            bridge={bridge}
            initial={account}
            onCancel={account ? () => setEditing(false) : undefined}
            onSaved={(info) => {
              setAccount(info);
              setEditing(false);
              setFolder("INBOX");
              setPage(1);
              void syncFolder("INBOX");
            }}
          />
          {account && (
            <button type="button" onClick={() => void removeAccount()} className="mt-6 text-xs text-danger hover:underline">
              이 PC 에서 계정 정보 삭제
            </button>
          )}
        </div>
      </div>
    );
  }

  const currentFolder = folder === ALL_MAIL_FOLDER ? undefined : folders.find((f) => f.path === folder);
  const title = folderLabel(currentFolder ?? { path: folder, name: folder, specialUse: null });

  return (
    <div className="h-screen flex bg-surface text-text">
      <MailSidebar
        userName={user?.name ?? account.email}
        email={account.email}
        folders={folders}
        folder={folder}
        onSelectFolder={selectFolder}
        filter={filter}
        onToggleFilter={toggleFilter}
        onSettings={() => setEditing(true)}
      />
      <main className="flex-1 min-w-0 h-full">
        {reading ? (
          <MailReader
            detail={detail}
            loading={loadingDetail}
            error={detailError}
            allowImages={allowImages}
            onBack={goList}
            onShowImages={() => {
              if (!detail) return;
              setAllowImages(true);
              void openMessage(detail.id, true);
            }}
            onMarkUnread={() => {
              if (!detail) return;
              void bridge.markSeen(detail.id, false).then(() => {
                reload();
                goList();
              });
            }}
            onToggleStar={(on) => {
              if (!detail) return;
              setDetail({ ...detail, flagged: on });
              void toggleStar(detail.id, on);
            }}
            onAttachment={(k, i) => void attachment(k, i)}
          />
        ) : (
          <MailListView
            title={title}
            items={items}
            total={total}
            page={page}
            pageSize={pageSize}
            selected={selected}
            syncing={syncing}
            syncError={syncError}
            query={query}
            onOpen={(id) => void openMessage(id)}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={(on) => setSelected(on ? new Set(items.map((m) => m.id)) : new Set())}
            onToggleStar={(id, on) => void toggleStar(id, on)}
            onMarkSelected={(seen) => void markSelected(seen)}
            onRefresh={() => void syncFolder(folder)}
            onSearch={(q) => {
              setQuery(q);
              setPage(1);
              setSelected(new Set());
            }}
            onPage={changePage}
            onPageSize={(n) => {
              setPageSize(n);
              setPage(1);
              setSelected(new Set());
            }}
          />
        )}
      </main>
    </div>
  );
}
