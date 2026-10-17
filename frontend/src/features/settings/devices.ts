// 기기 관리 화면의 타입과 표시용 순수 함수.

export type DeviceStatusName = "pending" | "approved" | "revoked";

export interface ClientDeviceRow {
  id: number;
  name: string;
  public_key_short: string;
  status: DeviceStatusName;
  approved_by: number | null;
  approved_by_name: string | null;
  approved_at: string | null;
  last_seen_at: string | null;
  last_ip: string | null;
  created_at: string;
}

export const DEVICE_STATUS: Record<DeviceStatusName, { label: string; tone: "orange" | "green" | "gray" }> = {
  pending: { label: "승인 대기", tone: "orange" },
  approved: { label: "사용 중", tone: "green" },
  revoked: { label: "사용 중지", tone: "gray" },
};

const ORDER: Record<DeviceStatusName, number> = { pending: 0, approved: 1, revoked: 2 };

/** 승인 대기를 맨 위로, 그다음 사용 중, 사용 중지 순. 같은 상태는 최근에 등록한 것부터. */
export function sortDevices(rows: ClientDeviceRow[]): ClientDeviceRow[] {
  return [...rows].sort((a, b) => ORDER[a.status] - ORDER[b.status] || b.id - a.id);
}

/** "2026-10-17 10:22" (로컬 시각). 값이 없으면 "-" */
export function formatDeviceTime(iso: string | null): string {
  if (!iso) return "-";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "-";
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}`;
}
