import { Trash2, X } from "lucide-react";
import { useEffect, useState, type FormEvent } from "react";
import { parseISODate, toISODate, WEEKDAY_LABELS } from "./dateUtils";
import {
  generateLunarYearlyOccurrences,
  getLeapMonthOfYear,
  getLunarMonthDayCount,
  lunarToSolar,
  solarToLunar,
} from "./lunarUtils";
import {
  EVENT_COLOR_HEX,
  EVENT_COLORS,
  type EventColor,
  type RecurrenceFreq,
  type ScheduleEvent,
  type ScheduleEventInput,
} from "./types";

interface EventFormModalProps {
  initialDate: string;
  event: ScheduleEvent | null;
  canEdit: boolean;
  onSave: (input: ScheduleEventInput) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}

const FREQ_LABELS: Record<RecurrenceFreq, string> = {
  none: "안함",
  daily: "매일",
  weekly: "매주",
  yearly: "매년",
};

const SOLAR_ONLY_FREQS: RecurrenceFreq[] = ["none", "daily", "weekly", "yearly"];
const LUNAR_ONLY_FREQS: RecurrenceFreq[] = ["none", "yearly"];

export function EventFormModal({ initialDate, event, canEdit, onSave, onDelete, onClose }: EventFormModalProps) {
  const isCreate = !event;
  const [title, setTitle] = useState(event?.title ?? "");
  const [description, setDescription] = useState(event?.description ?? "");
  const [startDate, setStartDate] = useState(event?.start_date ?? initialDate);
  const [endDate, setEndDate] = useState(event?.end_date ?? initialDate);
  const [color, setColor] = useState<EventColor>(event?.color ?? "blue");
  const [recurrenceFreq, setRecurrenceFreq] = useState<RecurrenceFreq>("none");
  const [recurrenceWeekdays, setRecurrenceWeekdays] = useState<number[]>([]);
  const [recurrenceUntil, setRecurrenceUntil] = useState(initialDate);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [calendarType, setCalendarType] = useState<"solar" | "lunar">(event?.is_lunar ? "lunar" : "solar");
  const initialLunar = solarToLunar(parseISODate(event?.start_date ?? initialDate));
  const [lunarYear, setLunarYear] = useState(initialLunar.year);
  const [lunarMonth, setLunarMonth] = useState(initialLunar.month);
  const [lunarDay, setLunarDay] = useState(initialLunar.day);
  const [lunarLeap, setLunarLeap] = useState(initialLunar.isLeap);

  const leapMonthOfYear = getLeapMonthOfYear(lunarYear);
  const canBeLeap = leapMonthOfYear === lunarMonth;
  const lunarDayCount = getLunarMonthDayCount(lunarYear, lunarMonth, lunarLeap) ?? 30;
  const computedSolar = calendarType === "lunar" ? lunarToSolar(lunarYear, lunarMonth, lunarDay, lunarLeap) : null;

  useEffect(() => {
    if (!canBeLeap && lunarLeap) setLunarLeap(false);
  }, [canBeLeap, lunarLeap]);

  useEffect(() => {
    if (lunarDay > lunarDayCount) setLunarDay(lunarDayCount);
  }, [lunarDay, lunarDayCount]);

  useEffect(() => {
    if (calendarType === "lunar" && (recurrenceFreq === "daily" || recurrenceFreq === "weekly")) {
      setRecurrenceFreq("none");
    }
  }, [calendarType, recurrenceFreq]);

  const availableFreqs = calendarType === "lunar" ? LUNAR_ONLY_FREQS : SOLAR_ONLY_FREQS;

  function toggleWeekday(day: number) {
    setRecurrenceWeekdays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]));
  }

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);

    let finalStart = startDate;
    let finalEnd = endDate;
    let lunarOccurrenceDates: string[] | null = null;

    if (calendarType === "lunar") {
      if (!computedSolar) {
        setError("유효하지 않은 음력 날짜입니다.");
        return;
      }
      finalStart = toISODate(computedSolar);
      finalEnd = finalStart;

      if (recurrenceFreq === "yearly") {
        if (!recurrenceUntil) {
          setError("반복 종료일을 선택해주세요.");
          return;
        }
        lunarOccurrenceDates = generateLunarYearlyOccurrences(
          lunarYear,
          lunarMonth,
          lunarDay,
          lunarLeap,
          parseISODate(recurrenceUntil)
        );
        if (lunarOccurrenceDates.length === 0) {
          setError("조건에 맞는 반복 일정이 없습니다. 반복 종료일을 조정해주세요.");
          return;
        }
      }
    } else {
      if (endDate < startDate) {
        setError("종료일은 시작일보다 빠를 수 없습니다.");
        return;
      }
      if (recurrenceFreq !== "none") {
        if (recurrenceUntil < startDate) {
          setError("반복 종료일은 시작일보다 빠를 수 없습니다.");
          return;
        }
        if (recurrenceFreq === "weekly" && recurrenceWeekdays.length === 0) {
          setError("매주 반복은 요일을 1개 이상 선택해주세요.");
          return;
        }
      }
    }

    setIsSubmitting(true);
    try {
      await onSave({
        title,
        description: description || null,
        start_date: finalStart,
        end_date: finalEnd,
        color,
        is_lunar: calendarType === "lunar",
        recurrence_freq: recurrenceFreq,
        recurrence_weekdays: recurrenceFreq === "weekly" ? recurrenceWeekdays : null,
        recurrence_until: recurrenceFreq !== "none" ? recurrenceUntil : null,
        lunar_occurrence_dates: lunarOccurrenceDates,
      });
    } catch {
      setError("저장 중 오류가 발생했습니다.");
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <div className="fixed inset-0 bg-black/30 flex items-center justify-center z-50 p-4" onClick={onClose}>
      <div
        className="bg-surface rounded-2xl p-6 w-full max-w-md border border-border max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-base font-semibold">{event ? "일정 수정" : "새 일정"}</h2>
          <button onClick={onClose} className="text-text-muted hover:text-text">
            <X size={18} />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs text-text-muted mb-1.5">제목</label>
            <input
              required
              disabled={!canEdit}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg disabled:opacity-60"
              autoFocus
            />
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5">달력 종류</label>
            <div className="flex gap-2">
              {(["solar", "lunar"] as const).map((t) => (
                <button
                  key={t}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setCalendarType(t)}
                  className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors disabled:opacity-60 ${
                    calendarType === t
                      ? "border-primary bg-tile-blue text-tile-blue-fg font-medium"
                      : "border-border text-text-muted hover:bg-bg"
                  }`}
                >
                  {t === "solar" ? "양력" : "음력"}
                </button>
              ))}
            </div>
          </div>

          {calendarType === "solar" ? (
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-xs text-text-muted mb-1.5">시작일</label>
                <input
                  type="date"
                  required
                  disabled={!canEdit}
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg disabled:opacity-60"
                />
              </div>
              <div>
                <label className="block text-xs text-text-muted mb-1.5">종료일</label>
                <input
                  type="date"
                  required
                  disabled={!canEdit}
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg disabled:opacity-60"
                />
              </div>
            </div>
          ) : (
            <div>
              <label className="block text-xs text-text-muted mb-1.5">음력 날짜</label>
              <div className="grid grid-cols-3 gap-2">
                <input
                  type="number"
                  required
                  disabled={!canEdit}
                  value={lunarYear}
                  onChange={(e) => setLunarYear(Number(e.target.value) || lunarYear)}
                  className="w-full rounded-lg border border-border px-2 py-2 text-sm outline-none focus:border-primary bg-bg disabled:opacity-60"
                  placeholder="년"
                />
                <select
                  disabled={!canEdit}
                  value={lunarMonth}
                  onChange={(e) => setLunarMonth(Number(e.target.value))}
                  className="w-full rounded-lg border border-border px-2 py-2 text-sm outline-none focus:border-primary bg-bg disabled:opacity-60"
                >
                  {Array.from({ length: 12 }, (_, i) => i + 1).map((m) => (
                    <option key={m} value={m}>
                      {m}월
                    </option>
                  ))}
                </select>
                <select
                  disabled={!canEdit}
                  value={lunarDay}
                  onChange={(e) => setLunarDay(Number(e.target.value))}
                  className="w-full rounded-lg border border-border px-2 py-2 text-sm outline-none focus:border-primary bg-bg disabled:opacity-60"
                >
                  {Array.from({ length: lunarDayCount }, (_, i) => i + 1).map((d) => (
                    <option key={d} value={d}>
                      {d}일
                    </option>
                  ))}
                </select>
              </div>
              {canBeLeap && (
                <label className="flex items-center gap-1.5 text-xs text-text-muted mt-2 cursor-pointer">
                  <input
                    type="checkbox"
                    disabled={!canEdit}
                    checked={lunarLeap}
                    onChange={(e) => setLunarLeap(e.target.checked)}
                  />
                  윤달 ({lunarMonth}월은 이 해에 윤달이 있습니다)
                </label>
              )}
              <p className="text-xs text-text-muted mt-2">
                → 양력 {computedSolar ? toISODate(computedSolar) : "유효하지 않은 날짜"}
              </p>
            </div>
          )}

          {isCreate && canEdit && (
            <div className="bg-bg rounded-lg p-3 space-y-3">
              <div>
                <label className="block text-xs text-text-muted mb-1.5">반복</label>
                <div className="flex gap-2">
                  {availableFreqs.map((f) => (
                    <button
                      key={f}
                      type="button"
                      onClick={() => setRecurrenceFreq(f)}
                      className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-colors ${
                        recurrenceFreq === f
                          ? "border-primary bg-tile-blue text-tile-blue-fg font-medium"
                          : "border-border text-text-muted hover:bg-surface"
                      }`}
                    >
                      {FREQ_LABELS[f]}
                    </button>
                  ))}
                </div>
              </div>

              {recurrenceFreq === "weekly" && (
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">반복 요일 (복수 선택)</label>
                  <div className="flex gap-1.5">
                    {WEEKDAY_LABELS.map((label, i) => (
                      <button
                        key={label}
                        type="button"
                        onClick={() => toggleWeekday(i)}
                        className={`w-8 h-8 rounded-full text-xs border transition-colors ${
                          recurrenceWeekdays.includes(i)
                            ? "border-primary bg-primary text-white font-medium"
                            : "border-border text-text-muted hover:bg-surface"
                        }`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                </div>
              )}

              {recurrenceFreq !== "none" && (
                <div>
                  <label className="block text-xs text-text-muted mb-1.5">
                    반복 종료일{calendarType === "lunar" && " (양력 기준)"}
                  </label>
                  <input
                    type="date"
                    value={recurrenceUntil}
                    onChange={(e) => setRecurrenceUntil(e.target.value)}
                    className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-surface"
                  />
                </div>
              )}
            </div>
          )}

          <div>
            <label className="block text-xs text-text-muted mb-1.5">색상</label>
            <div className="flex flex-wrap gap-2">
              {EVENT_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  disabled={!canEdit}
                  onClick={() => setColor(c)}
                  className={`w-7 h-7 rounded-full transition-transform disabled:opacity-60 ${
                    color === c ? "ring-2 ring-offset-2 ring-text scale-105" : ""
                  }`}
                  style={{ backgroundColor: EVENT_COLOR_HEX[c] }}
                  aria-label={c}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-xs text-text-muted mb-1.5">설명 (선택)</label>
            <textarea
              rows={3}
              disabled={!canEdit}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full rounded-lg border border-border px-3 py-2 text-sm outline-none focus:border-primary bg-bg resize-y disabled:opacity-60"
            />
          </div>

          {event && (
            <p className="text-xs text-text-muted">
              등록자: {event.created_by_name}
              {event.is_completed && " · 완료됨"}
              {event.recurrence_group_id && " · 반복 일정"}
            </p>
          )}

          {error && <p className="text-xs text-danger">{error}</p>}

          {canEdit ? (
            <div className="flex items-center justify-between pt-1">
              <div>
                {event && (
                  <button
                    type="button"
                    onClick={onDelete}
                    className="flex items-center gap-1 text-xs text-danger hover:opacity-80"
                  >
                    <Trash2 size={14} />
                    삭제
                  </button>
                )}
              </div>
              <button
                type="submit"
                disabled={isSubmitting}
                className="rounded-lg bg-primary hover:bg-primary-hover text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:opacity-60"
              >
                {isSubmitting ? "저장 중..." : "저장"}
              </button>
            </div>
          ) : (
            <p className="text-xs text-text-muted">본인이 등록한 일정만 수정·삭제할 수 있습니다.</p>
          )}
        </form>
      </div>
    </div>
  );
}
