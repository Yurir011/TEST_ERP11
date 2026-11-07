import { useEffect, useRef, useState, type FormEvent } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { MainLayout } from "../../components/layout/MainLayout";
import { MENU_PERMISSION_OPTIONS, type CurrentUser, type JobGrade, type JobTitle, type MenuPermissionKey } from "../../lib/auth";
import { ApiError, apiDelete, apiGet, apiPost, apiPut } from "../../lib/api";
import { logDebug, logError } from "../../lib/logger";
import { todayISO } from "../../lib/date";
import { refreshPaymentAccounts, usePaymentAccounts, type PaymentAccount } from "../payments/paymentAccounts";
import { NfcCardsSection } from "./NfcCardsSection";
import { PasskeysSection } from "./PasskeysSection";

const GRADE_OPTIONS: { value: JobGrade; label: string }[] = [
  { value: "staff", label: "사원" },
  { value: "assistant_manager", label: "대리" },
  { value: "manager", label: "과장" },
  { value: "director", label: "이사" },
  { value: "chief", label: "소장" },
];

const TITLE_OPTIONS: { value: JobTitle | null; label: string }[] = [
  { value: null, label: "없음" },
  { value: "dept_head", label: "부서장" },
  { value: "team_lead", label: "팀장" },
  { value: "ceo", label: "대표" },
];

/** 직원 등록·수정 화면에서 다루는 법인카드 한 줄 (카드사 + 뒤 4자리). id 가 null 이면 아직 저장 전인 새 카드. */
interface CardRow {
  key: string;
  account: PaymentAccount | null;
  issuer: string;
  last4: string;
}

export function UserFormPage() {
  const { id } = useParams<{ id: string }>();
  const isEdit = Boolean(id);
  const navigate = useNavigate();

  const [employeeNo, setEmployeeNo] = useState("");
  const [email, setEmail] = useState("");
  const [name, setName] = useState("");
  const [savedName, setSavedName] = useState(""); // 불러온 이름 (NFC 카드 칸 제목용: 입력 중인 이름과 따로 둔다)
  const [password, setPassword] = useState("");
  const [grade, setGrade] = useState<JobGrade>("staff");
  const [title, setTitle] = useState<JobTitle | null>(null);
  const [hireDate, setHireDate] = useState(todayISO());
  const [birthDate, setBirthDate] = useState("");
  const [address, setAddress] = useState("");
  const [menuPermissions, setMenuPermissions] = useState<MenuPermissionKey[]>([]);
  const [cardRows, setCardRows] = useState<CardRow[]>([]);
  const [removedCards, setRemovedCards] = useState<PaymentAccount[]>([]);
  const { all: allAccounts, loaded: accountsLoaded } = usePaymentAccounts();
  const cardsInit = useRef(false);

  const [isLoading, setIsLoading] = useState(isEdit);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (isEdit) return;
    apiGet<{ employee_no: string }>("/api/users/next-employee-no")
      .then((res) => setEmployeeNo(res.employee_no))
      .catch((err) => logError("UserForm", "다음 사번 조회 실패", err));
  }, [isEdit]);

  useEffect(() => {
    if (!isEdit) return;
    apiGet<CurrentUser[]>("/api/users")
      .then((list) => {
        const found = list.find((u) => u.id === Number(id));
        if (!found) {
          setError("직원을 찾을 수 없습니다.");
          return;
        }
        setEmployeeNo(found.employee_no);
        setEmail(found.email);
        setName(found.name);
        setSavedName(found.name);
        setGrade(found.grade);
        setTitle(found.title);
        setHireDate(found.hire_date);
        setBirthDate(found.birth_date ?? "");
        setAddress(found.address ?? "");
        setMenuPermissions(found.menu_permissions ?? []);
      })
      .catch((err) => {
        logError("UserForm", "조회 실패", err);
        setError("직원 정보를 불러오지 못했습니다.");
      })
      .finally(() => setIsLoading(false));
  }, [id, isEdit]);

  function toggleMenuPermission(key: MenuPermissionKey) {
    setMenuPermissions((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  }

  // 수정 화면: 이 직원이 소유한 법인카드를 한 번만 불러온다
  useEffect(() => {
    if (!isEdit || !accountsLoaded || cardsInit.current) return;
    cardsInit.current = true;
    setCardRows(
      allAccounts
        .filter((a) => a.kind === "card" && a.owner_user_id === Number(id) && a.is_active)
        .map((a) => ({ key: `a${a.id}`, account: a, issuer: a.issuer, last4: a.last4 ?? "" })),
    );
  }, [isEdit, id, accountsLoaded, allAccounts]);

  const patchCard = (key: string, p: Partial<CardRow>) => setCardRows((rows) => rows.map((r) => (r.key === key ? { ...r, ...p } : r)));
  const removeCard = (row: CardRow) => {
    setCardRows((rows) => rows.filter((r) => r.key !== row.key));
    if (row.account) setRemovedCards((prev) => [...prev, row.account as PaymentAccount]);
  };

  /** 사용자 저장이 끝난 뒤 법인카드 목록을 카드·계좌 관리와 맞춘다 (추가·수정·삭제). */
  async function syncCards(userId: number) {
    for (const a of removedCards) {
      logDebug("UserForm", `법인카드 삭제: account_id=${a.id}`);
      await apiDelete(`/api/payment-accounts/${a.id}`);
    }
    for (const r of cardRows) {
      const issuer = r.issuer.trim();
      const last4 = r.last4.trim();
      if (r.account) {
        if (issuer === r.account.issuer && last4 === (r.account.last4 ?? "")) continue;
        logDebug("UserForm", `법인카드 수정: account_id=${r.account.id}`);
        await apiPut(`/api/payment-accounts/${r.account.id}`, {
          nickname: r.account.nickname, issuer, last4, pay_day: r.account.pay_day, is_active: r.account.is_active, owner_user_id: userId,
        });
      } else {
        logDebug("UserForm", `법인카드 추가: user_id=${userId}, issuer=${issuer}`);
        await apiPost("/api/payment-accounts", { kind: "card", nickname: `${issuer} ${last4}`, issuer, last4, pay_day: 15, owner_user_id: userId });
      }
    }
    await refreshPaymentAccounts();
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    for (const r of cardRows) {
      if (!r.issuer.trim() || !/^\d{4}$/.test(r.last4.trim())) {
        setError("법인카드는 카드사와 카드번호 끝 4자리(숫자)를 모두 입력해주세요.");
        return;
      }
    }
    setIsSubmitting(true);
    try {
      let savedId = Number(id);
      if (isEdit) {
        await apiPut(`/api/users/${id}`, {
          name,
          grade,
          title,
          hire_date: hireDate,
          birth_date: birthDate || null,
          address: address.trim() || null,
          menu_permissions: menuPermissions,
        });
      } else {
        const created = await apiPost<{ id: number }>("/api/users", {
          email,
          name,
          password,
          grade,
          title,
          hire_date: hireDate,
          birth_date: birthDate || null,
          address: address.trim() || null,
          menu_permissions: menuPermissions,
        });
        savedId = created.id;
      }
      await syncCards(savedId);
      navigate("/settings", { replace: true });
    } catch (err) {
      logError("UserForm", "저장 실패", err);
      setError(err instanceof ApiError ? err.message : "저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  const inputCls = "w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg";
  const labelCls = "block text-xs text-text-muted mb-1.5";
  const gradeLabel = GRADE_OPTIONS.find((o) => o.value === grade)?.label ?? "";
  const titleLabel = TITLE_OPTIONS.find((o) => o.value === title)?.label;

  return (
    <MainLayout title={isEdit ? "직원 정보 수정" : "새 직원 등록"}>
      {isLoading ? (
        <p className="text-sm text-text-muted">불러오는 중...</p>
      ) : (
        <form onSubmit={handleSubmit} className="grid grid-cols-1 lg:grid-cols-[220px_minmax(0,1fr)] gap-4 max-w-4xl items-start">
          {/* 입력한 이름·직급이 바로 보이는 프로필 카드 */}
          <div className="bg-surface border border-border rounded-2xl p-5 flex flex-col items-center gap-1.5 text-center">
            <div className="w-16 h-16 rounded-full bg-tile-blue text-tile-blue-fg grid place-items-center text-2xl font-bold">
              {name.trim().charAt(0) || "?"}
            </div>
            <p className="text-base font-semibold mt-1.5 break-all">{name.trim() || "이름 미입력"}</p>
            <p className="text-xs text-text-muted">
              {gradeLabel}
              {titleLabel && title ? ` · ${titleLabel}` : ""}
            </p>
            <p className="text-xs text-text-muted">{employeeNo || "사번 생성 중..."}</p>
            <p className="text-xs text-tile-green-fg mt-1">입사 {hireDate || "-"}</p>
          </div>

          <div className="flex flex-col gap-4 min-w-0">
            <section className="bg-surface border border-border rounded-2xl p-5">
              <h2 className="text-sm font-semibold mb-3">계정 정보</h2>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                  <label className={labelCls}>사번</label>
                  <input disabled value={employeeNo || "자동생성 중..."} readOnly className={`${inputCls} disabled:opacity-60`} />
                </div>
                <div>
                  <label className={labelCls}>이메일 (로그인 ID)</label>
                  <input required type="email" disabled={isEdit} value={email} onChange={(e) => setEmail(e.target.value)} className={`${inputCls} disabled:opacity-60`} />
                </div>
                <div>
                  <label className={labelCls}>이름</label>
                  <input required value={name} onChange={(e) => setName(e.target.value)} className={inputCls} />
                </div>
                {!isEdit && (
                  <div>
                    <label className={labelCls}>초기 비밀번호</label>
                    <input required type="text" value={password} onChange={(e) => setPassword(e.target.value)} placeholder="4자 이상" className={inputCls} />
                  </div>
                )}
              </div>
            </section>

            <section className="bg-surface border border-border rounded-2xl p-5">
              <h2 className="text-sm font-semibold mb-3">인사 정보</h2>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                <div>
                  <label className={labelCls}>직급</label>
                  <select value={grade} onChange={(e) => setGrade(e.target.value as JobGrade)} className={inputCls}>
                    {GRADE_OPTIONS.map((opt) => (
                      <option key={opt.value} value={opt.value}>
                        {opt.label}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className={labelCls}>입사일</label>
                  <input type="date" required value={hireDate} onChange={(e) => setHireDate(e.target.value)} className={inputCls} />
                </div>
                <div>
                  <label className={labelCls}>생년월일</label>
                  <input type="date" value={birthDate} onChange={(e) => setBirthDate(e.target.value)} className={inputCls} />
                </div>
                <div className="sm:col-span-3">
                  <label className={labelCls}>주소</label>
                  <input value={address} onChange={(e) => setAddress(e.target.value)} className={inputCls} />
                </div>
              </div>
              <div className="mt-4">
                <label className={labelCls}>직책</label>
                <div className="flex flex-wrap gap-2">
                  {TITLE_OPTIONS.map((opt) => (
                    <button
                      key={opt.label}
                      type="button"
                      onClick={() => setTitle(opt.value)}
                      className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
                        title === opt.value ? "border-primary bg-tile-blue text-tile-blue-fg font-medium" : "border-border text-text-muted hover:bg-bg"
                      }`}
                    >
                      {opt.label}
                    </button>
                  ))}
                </div>
                <p className="text-xs text-text-muted mt-1.5">대표로 지정하면 관리자 권한이, 그 외에는 일반직원 권한이 자동으로 부여됩니다.</p>
              </div>
            </section>

            <section className="bg-surface border border-border rounded-2xl p-5">
              <h2 className="text-sm font-semibold mb-1">법인카드</h2>
              <p className="text-xs text-text-muted mb-3">이 직원이 소유한 법인카드입니다. 소유한 카드의 사용 내역은 이 직원과 관리자, 이 직원이 허용한 직원만 등록·수정할 수 있습니다.</p>
              <div className="flex flex-col gap-2">
                {cardRows.map((r) => (
                  <div key={r.key} className="grid grid-cols-[1fr_8rem_auto] items-center gap-2">
                    <input value={r.issuer} onChange={(e) => patchCard(r.key, { issuer: e.target.value })} aria-label="카드사" placeholder="카드사 (예: 신한카드)" maxLength={50} className={inputCls} />
                    <input
                      value={r.last4}
                      onChange={(e) => patchCard(r.key, { last4: e.target.value.replace(/\D/g, "").slice(0, 4) })}
                      aria-label="카드번호 끝 4자리"
                      placeholder="끝 4자리"
                      inputMode="numeric"
                      maxLength={4}
                      className={inputCls}
                    />
                    <button type="button" onClick={() => removeCard(r)} className="rounded-lg border border-border px-3 py-2 text-xs text-text-muted hover:bg-bg hover:text-danger">
                      삭제
                    </button>
                  </div>
                ))}
                {cardRows.length === 0 && <p className="text-xs text-text-muted">등록된 법인카드가 없습니다.</p>}
              </div>
              <button
                type="button"
                onClick={() => setCardRows((rows) => [...rows, { key: `n${Date.now()}${rows.length}`, account: null, issuer: "", last4: "" }])}
                className="mt-3 rounded-lg border border-border px-3 py-1.5 text-xs hover:bg-bg"
              >
                + 법인카드 추가
              </button>
            </section>

            {title !== "ceo" && (
              <section className="bg-surface border border-border rounded-2xl p-5">
                <h2 className="text-sm font-semibold mb-3">메뉴 열람 권한</h2>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-2">
                  {MENU_PERMISSION_OPTIONS.map((opt) => (
                    <label
                      key={opt.value}
                      className={`flex items-center gap-2 rounded-lg border px-3 py-2 text-sm cursor-pointer hover:bg-bg ${
                        opt.sensitive ? "border-danger/40 text-danger font-medium" : "border-border"
                      }`}
                    >
                      <input
                        type="checkbox"
                        checked={menuPermissions.includes(opt.value)}
                        onChange={() => toggleMenuPermission(opt.value)}
                        className={opt.sensitive ? "accent-danger" : "accent-primary"}
                      />
                      {opt.label}
                    </label>
                  ))}
                </div>
                <p className="text-xs text-text-muted mt-2">체크한 메뉴만 사이드바에 표시되며 해당 화면에 접근할 수 있습니다. 기본값은 전부 비활성화입니다.</p>
              </section>
            )}

            {error && <p className="text-xs text-danger">{error}</p>}

            <div className="flex items-center justify-end gap-2">
              <button
                type="button"
                onClick={() => navigate(-1)}
                className="rounded-lg border border-border text-sm text-text-muted px-5 py-2.5 hover:bg-bg transition-colors"
              >
                취소
              </button>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
              >
                {isSubmitting ? "저장 중..." : isEdit ? "저장" : "직원 등록"}
              </button>
            </div>
          </div>
        </form>
      )}
      {isEdit && !isLoading && savedName && <NfcCardsSection key={id} userId={Number(id)} userName={savedName} />}
      {isEdit && !isLoading && savedName && <PasskeysSection key={`pk-${id}`} userId={Number(id)} userName={savedName} />}
    </MainLayout>
  );
}
