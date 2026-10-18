import { Mail } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { useAuth } from "../../context/useAuth";
import { ALL_MAIL_FOLDER, type MailAccountInfo, type MailDocRef, type MailDetail, type MailDraft, type MailDraftKind, type MailFolder, type MailSendResult, type MailSummary, getBenchClient } from "../../lib/desktop";
import { logDebug, logError } from "../../lib/logger";
import { ComposeView } from "./ComposeView";
import { reportDocumentMailSent } from "./documentMail";
import { MailAccountForm } from "./MailAccountForm";
import { MailListView } from "./MailListView";
import { MailReader } from "./MailReader";
import { MailSidebar } from "./MailSidebar";
import { DEFAULT_PAGE_SIZE, folderLabel, isJunkFolder, isTrashFolder, sortFolders } from "./mailFormat";

type QuickFilter = { unread?: boolean; flagged?: boolean; attachment?: boolean };
type ComposeInit = Pick<MailDraft, "to" | "cc" | "subject" | "body" | "attachments" | "threading">;
const BLANK_DRAFT: ComposeInit = { to: "", cc: "", subject: "", body: "", attachments: [] };

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
  const [bodyIds, setBodyIds] = useState<number[] | null>(null); // 서버 본문 검색으로 좁혀진 메일 번호 (없으면 null)
  const [searching, setSearching] = useState(false);
  const [searchNotice, setSearchNotice] = useState<string | null>(null);
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
  const [composing, setComposing] = useState<ComposeInit | null>(null);
  const composeState = useRef<{ dirty: boolean; attachmentIds: string[] }>({ dirty: false, attachmentIds: [] });
  /** 쓰고 있는 메일이 ERP 문서에서 시작된 것이면 그 문서 (보낸 뒤 발송 이력을 남긴다) */
  const composeDoc = useRef<MailDocRef | null>(null);
  const detailReq = useRef(0);
  const openMessageRef = useRef<(id: number) => Promise<void>>(async () => {});
  const reload = useCallback(() => setTick((t) => t + 1), []);

  // 저장된 목록(폴더·조건·검색·쪽)은 바뀔 때마다 이 PC 의 저장소에서 바로 읽는다
  useEffect(() => {
    if (!account) return;
    let cancelled = false;
    void (async () => {
      const [fs, list] = await Promise.all([bridge.folders(), bridge.list(folder, (page - 1) * pageSize, pageSize, { ...filter, query: query || undefined, ids: bodyIds ?? undefined })]);
      if (cancelled) return;
      setFolders(fs);
      setItems(list.items);
      setTotal(list.total);
    })();
    return () => {
      cancelled = true;
    };
  }, [bridge, account, folder, filter, query, bodyIds, page, pageSize, tick]);

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

  /** 메일을 쓰는 중이면 버릴지 물어보고, 계속 나가도 되면 true */
  async function leaveCompose(): Promise<boolean> {
    if (!composing) return true;
    if (composeState.current.dirty && !(await dialog.confirm("작성 중인 메일을 버릴까요?", { okLabel: "버리기", danger: true }))) return false;
    await bridge.discardAttachments(composeState.current.attachmentIds);
    composeDoc.current = null;
    setComposing(null);
    return true;
  }

  /** 문서 화면에서 "메일 보내기"로 넘어온 초안(PDF 첨부 포함)이 있으면 쓰기 화면으로 연다 */
  async function openPendingDocumentCompose() {
    const pending = await bridge.consumePendingCompose();
    if (!pending) return;
    if (!(await leaveCompose())) {
      await bridge.discardAttachments(pending.draft.attachments.map((a) => a.id)); // 쓰던 메일을 계속 쓰기로 했으니 새 초안은 버린다
      return;
    }
    composeState.current = { dirty: false, attachmentIds: pending.draft.attachments.map((a) => a.id) };
    composeDoc.current = pending.doc;
    logDebug("Mail", `문서에서 시작한 메일 쓰기: ${pending.doc.type}#${pending.doc.id}`);
    setComposing(pending.draft);
  }
  const openPendingComposeRef = useRef<() => Promise<void>>(async () => {});

  /** 새 메일·내게쓰기·답장·전체답장·전달 화면 열기 */
  async function openCompose(kind: "new" | MailDraftKind, id?: number) {
    if (!(await leaveCompose())) return;
    composeDoc.current = null;
    let init: ComposeInit = BLANK_DRAFT;
    if (kind !== "new") {
      const r = await bridge.composeDraft(kind, id);
      if (!r.ok) {
        dialog.notifyError(r.error);
        return;
      }
      init = r.value;
    }
    composeState.current = { dirty: false, attachmentIds: init.attachments.map((a) => a.id) };
    setComposing(init);
  }

  function onSent(result: MailSendResult, sent: { to: string; cc: string; bcc: string; subject: string }) {
    const doc = composeDoc.current;
    composeDoc.current = null;
    if (doc) void reportDocumentMailSent(doc, sent); // 문서 상세의 발송 이력용. 실패해도 메일은 이미 나갔다
    setComposing(null);
    if (result.savedToSent === false) dialog.notifyError("메일을 보냈지만 보낸메일함에는 저장하지 못했습니다.");
    else dialog.notify("메일을 보냈습니다.");
    if (result.savedToSent === true) void syncFolder(folder); // 보낸메일함을 보고 있다면 새로 보낸 메일이 보이게
  }

  // 새 메일 확인으로 목록이 바뀌었다는 신호, 알림을 눌러 특정 메일을 열라는 신호
  useEffect(() => {
    if (!account) return;
    const offChanged = bridge.onChanged(() => setTick((t) => t + 1));
    const offOpen = bridge.onOpenMessage(({ id }) => void openMessageRef.current(id));
    const offCompose = bridge.onOpenCompose(() => void openPendingComposeRef.current());
    void bridge.consumePendingOpen().then((id) => id && void openMessageRef.current(id));
    void openPendingComposeRef.current();
    return () => {
      offChanged();
      offOpen();
      offCompose();
    };
  }, [bridge, account]);

  function goList() {
    setReading(false);
    setDetail(null);
    setDetailError(null);
  }

  async function selectFolder(path: string) {
    if (!(await leaveCompose())) return;
    setFolder(path);
    setQuery("");
    setBodyIds(null);
    setSearchNotice(null);
    setPage(1);
    setSelected(new Set());
    goList();
    void syncFolder(path);
  }

  async function toggleFilter(key: keyof QuickFilter) {
    if (!(await leaveCompose())) return;
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
    if (!(await leaveCompose())) return;
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

  /** 검색: 본문 포함이면 서버에서 찾은 번호로 목록을 좁힌다. 서버 검색에 실패하면 제목·보낸 사람 검색으로 대신하고 알린다 */
  async function doSearch(q: string, includeBody: boolean) {
    setPage(1);
    setSelected(new Set());
    setSearchNotice(null);
    if (!q) {
      setQuery("");
      setBodyIds(null);
      return;
    }
    if (!includeBody) {
      setBodyIds(null);
      setQuery(q);
      return;
    }
    setSearching(true);
    try {
      const r = await bridge.searchBody(folder, q);
      if (r.ok) {
        setQuery("");
        setBodyIds(r.value.ids);
      } else {
        setBodyIds(null);
        setQuery(q);
        setSearchNotice(`서버에서 본문을 검색하지 못해 제목·보낸 사람만 찾았습니다. (${r.error})`);
      }
    } catch (err) {
      logError("Mail", "서버 본문 검색 중 오류", err);
      setBodyIds(null);
      setQuery(q);
      setSearchNotice("서버에서 본문을 검색하지 못해 제목·보낸 사람만 찾았습니다.");
    } finally {
      setSearching(false);
    }
  }

  /** 삭제: 휴지통이 아닌 곳에서는 휴지통으로 옮기고, 휴지통에서는 확인한 뒤 완전히 지운다 */
  async function deleteItems(ids: number[], fromTrash: boolean) {
    if (ids.length === 0) return;
    if (fromTrash && !(await dialog.confirm(`선택한 메일 ${ids.length}통을 완전히 삭제할까요? 되돌릴 수 없습니다.`, { okLabel: "완전 삭제", danger: true }))) return;
    const r = await bridge.remove(ids, fromTrash);
    if (!r.ok) {
      dialog.notifyError(r.error);
      return;
    }
    dialog.notify(fromTrash ? `메일 ${r.value.deleted}통을 완전히 삭제했습니다.` : `메일 ${r.value.trashed}통을 휴지통으로 옮겼습니다.`);
    afterManage();
  }

  async function spamItems(ids: number[]) {
    if (ids.length === 0) return;
    const r = await bridge.spam(ids);
    if (!r.ok) {
      dialog.notifyError(r.error);
      return;
    }
    dialog.notify(`메일 ${r.value.moved}통을 스팸메일함으로 옮겼습니다.`);
    afterManage();
  }

  async function moveItems(ids: number[], dest: string) {
    if (ids.length === 0) return;
    const r = await bridge.move(ids, dest);
    if (!r.ok) {
      dialog.notifyError(r.error);
      return;
    }
    const target = folders.find((f) => f.path === dest);
    dialog.notify(`메일 ${r.value.moved}통을 ${target ? folderLabel(target) : "선택한 폴더"}(으)로 옮겼습니다.`);
    afterManage();
  }

  /** 삭제·이동·스팸 신고 뒤: 선택을 풀고 목록을 다시 읽고, 읽고 있던 메일이었다면 목록으로 돌아간다 */
  function afterManage() {
    setSelected(new Set());
    goList();
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

  useEffect(() => {
    openMessageRef.current = (id) => openMessage(id); // 알림 신호가 항상 최신 상태의 열기 함수를 쓰게 한다
    openPendingComposeRef.current = openPendingDocumentCompose;
  });

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
        onSelectFolder={(path) => void selectFolder(path)}
        filter={filter}
        onToggleFilter={(key) => void toggleFilter(key)}
        onSettings={() => void leaveCompose().then((ok) => ok && setEditing(true))}
        onCompose={() => void openCompose("new")}
        onComposeSelf={() => void openCompose("self")}
      />
      <main className="flex-1 min-w-0 h-full">
        {composing ? (
          <ComposeView
            key={composing.subject + composing.to + composing.attachments.map((a) => a.id).join()}
            bridge={bridge}
            fromName={user?.name ?? ""}
            fromEmail={account.email}
            initial={composing}
            onState={(st) => {
              composeState.current = st;
            }}
            onSent={onSent}
            onClose={() => {
              composeDoc.current = null;
              setComposing(null);
            }}
          />
        ) : reading ? (
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
            onCompose={(k) => detail && void openCompose(k, detail.id)}
            inTrash={isTrashFolder(detail ? folders.find((f) => f.path === detail.folder) : undefined)}
            onDelete={() => detail && void deleteItems([detail.id], isTrashFolder(folders.find((f) => f.path === detail.folder)))}
            onSpam={() => detail && void spamItems([detail.id])}
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
            searching={searching}
            bodySearchActive={bodyIds !== null}
            searchNotice={searchNotice}
            inTrash={isTrashFolder(currentFolder)}
            inJunk={isJunkFolder(currentFolder)}
            moveTargets={sortFolders(folders).filter((f) => f.path !== folder)}
            onDelete={() => void deleteItems([...selected], isTrashFolder(currentFolder))}
            onSpam={() => void spamItems([...selected])}
            onForward={() => selected.size === 1 && void openCompose("forward", [...selected][0])}
            onMove={(dest) => void moveItems([...selected], dest)}
            onOpen={(id) => void openMessage(id)}
            onToggleSelect={toggleSelect}
            onToggleSelectAll={(on) => setSelected(on ? new Set(items.map((m) => m.id)) : new Set())}
            onToggleStar={(id, on) => void toggleStar(id, on)}
            onMarkSelected={(seen) => void markSelected(seen)}
            onRefresh={() => void syncFolder(folder)}
            onSearch={(q, includeBody) => void doSearch(q, includeBody)}
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
