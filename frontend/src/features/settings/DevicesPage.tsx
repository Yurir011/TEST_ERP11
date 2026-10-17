import { Check, Pencil } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import { MainLayout } from "../../components/layout/MainLayout";
import { useDialog } from "../../components/ui/dialog/useDialog";
import { SOFT_BADGE } from "../../components/ui/softBadge";
import { ApiError, apiDelete, apiGet, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { DEVICE_STATUS, formatDeviceTime, sortDevices, type ClientDeviceRow } from "./devices";

const TH = "py-3 px-4 font-semibold text-[#3A4F7A] text-center";
const TD = "py-2.5 px-4 text-center";

export function DevicesPage() {
  const dialog = useDialog();
  const [devices, setDevices] = useState<ClientDeviceRow[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<number | null>(null);

  const load = useCallback(() => {
    logDebug("Devices", "기기 목록 조회");
    apiGet<ClientDeviceRow[]>("/api/devices")
      .then((rows) => {
        setError(null);
        setDevices(sortDevices(rows));
      })
      .catch((err) => {
        logError("Devices", "목록 조회 실패", err);
        setError("기기 목록을 불러오지 못했습니다.");
      });
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  async function run(d: ClientDeviceRow, action: () => Promise<unknown>, failMessage: string) {
    setBusyId(d.id);
    try {
      await action();
      load();
    } catch (err) {
      logError("Devices", failMessage, err);
      dialog.notifyError(err instanceof ApiError ? err.message : failMessage);
    } finally {
      setBusyId(null);
    }
  }

  async function approve(d: ClientDeviceRow) {
    const ok = await dialog.confirm(
      `'${d.name}' (키 ${d.public_key_short}) 을(를) 승인할까요?\n이 PC 의 데스크톱 앱에서 등록된 NFC 카드로 로그인할 수 있게 됩니다.\n직접 설치한 PC 가 맞는지 키 앞 8자리를 앱 쪽과 확인하세요.`,
      { okLabel: "승인" },
    );
    if (ok) await run(d, () => apiPut(`/api/devices/${d.id}/approve`), "승인 중 오류가 발생했습니다.");
  }

  async function revoke(d: ClientDeviceRow) {
    const ok = await dialog.confirm(`'${d.name}' 을(를) 사용 중지할까요?\n이 PC 에서는 더 이상 카드로 로그인할 수 없습니다. 다시 쓰려면 앱을 새로 설치해 등록해야 합니다.`, {
      okLabel: "사용 중지",
      danger: true,
    });
    if (ok) await run(d, () => apiPut(`/api/devices/${d.id}/revoke`), "사용 중지 중 오류가 발생했습니다.");
  }

  async function reject(d: ClientDeviceRow) {
    const ok = await dialog.confirm(`'${d.name}' 의 등록 요청을 거절(삭제)할까요?`, { okLabel: "거절", danger: true });
    if (ok) await run(d, () => apiDelete(`/api/devices/${d.id}`), "삭제 중 오류가 발생했습니다.");
  }

  async function rename(d: ClientDeviceRow) {
    const name = await dialog.prompt("기기 이름을 입력하세요 (예: 영업팀 PC).", { okLabel: "저장" });
    if (name === null) return;
    if (!name.trim()) return dialog.notifyError("기기 이름을 입력하세요.");
    await run(d, () => apiPut(`/api/devices/${d.id}`, { name: name.trim() }), "이름 변경 중 오류가 발생했습니다.");
  }

  const pendingCount = devices?.filter((d) => d.status === "pending").length ?? 0;

  return (
    <MainLayout
      title="설정 · 기기 관리"
      description="데스크톱 앱이 설치된 PC 를 승인하면 그 PC 에서 NFC 카드 로그인을 쓸 수 있습니다. 앱을 처음 실행하면 여기에 승인 대기로 나타납니다."
    >
      {error && <p className="text-sm text-danger mb-4">{error}</p>}
      {pendingCount > 0 && <p className="text-sm mb-4 rounded-lg bg-tile-orange text-tile-orange-fg px-3 py-2">승인을 기다리는 기기가 {pendingCount}대 있습니다.</p>}

      {devices !== null && (
        <div className="bg-surface border border-border rounded-2xl overflow-x-auto">
          <table className="w-full text-sm border-collapse [&_th:not(:first-child)]:border-l [&_th:not(:first-child)]:border-primary/[0.12] [&_td:not(:first-child)]:border-l [&_td:not(:first-child)]:border-text/[0.07]">
            <thead>
              <tr className="bg-primary/[0.06] border-b border-border">
                <th className={TH}>이름</th>
                <th className={TH}>키(앞 8자리)</th>
                <th className={TH}>상태</th>
                <th className={TH}>승인</th>
                <th className={TH}>마지막 접속</th>
                <th className={`${TH} w-px whitespace-nowrap`}></th>
              </tr>
            </thead>
            <tbody>
              {devices.length === 0 && (
                <tr>
                  <td colSpan={6} className="py-8 text-center text-text-muted">
                    등록된 기기가 없습니다. 데스크톱 앱을 설치해 서버에 연결하면 여기에 나타납니다.
                  </td>
                </tr>
              )}
              {devices.map((d) => {
                const st = DEVICE_STATUS[d.status];
                const busy = busyId === d.id;
                return (
                  <tr key={d.id} className="border-b border-border last:border-0">
                    <td className={`${TD} font-medium`}>{d.name}</td>
                    <td className={`${TD} font-mono text-xs`}>{d.public_key_short}</td>
                    <td className={TD}>
                      <span className={`px-2 py-0.5 text-xs ${SOFT_BADGE[st.tone]}`}>{st.label}</span>
                    </td>
                    <td className={`${TD} text-text-muted`}>{d.approved_at ? `${d.approved_by_name ?? "-"} · ${d.approved_at.slice(0, 10)}` : "-"}</td>
                    <td className={`${TD} text-text-muted`}>
                      {formatDeviceTime(d.last_seen_at)}
                      {d.last_ip ? <div className="text-xs">{d.last_ip}</div> : null}
                    </td>
                    <td className={`${TD} whitespace-nowrap`}>
                      <div className="flex items-center justify-center gap-1.5">
                        {d.status === "pending" && (
                          <>
                            <button type="button" disabled={busy} onClick={() => approve(d)} className="flex items-center gap-1 text-xs rounded-lg bg-primary text-white px-2.5 py-1.5 hover:bg-primary-hover disabled:opacity-60">
                              <Check size={13} />
                              승인
                            </button>
                            <button type="button" disabled={busy} onClick={() => reject(d)} className="text-xs border border-border rounded-lg px-2.5 py-1.5 hover:bg-bg disabled:opacity-60">
                              거절
                            </button>
                          </>
                        )}
                        {d.status === "approved" && (
                          <button type="button" disabled={busy} onClick={() => revoke(d)} className="text-xs border border-border text-danger rounded-lg px-2.5 py-1.5 hover:bg-bg disabled:opacity-60">
                            사용 중지
                          </button>
                        )}
                        <button type="button" disabled={busy} title="이름 변경" aria-label={`${d.name} 이름 변경`} onClick={() => rename(d)} className="text-text-muted hover:text-text p-1">
                          <Pencil size={14} />
                        </button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}
    </MainLayout>
  );
}
