import { useEffect, useRef, useState } from "react";

// 유니코드 표준 이모지(무료·범용). 별도 이미지나 라이브러리 없이 기기(Windows/Android/iOS) 기본 글꼴로 그려진다.
export const EMOJI_GROUPS: { label: string; icon: string; emojis: string[] }[] = [
  {
    label: "표정",
    icon: "😀",
    emojis: [
      "😀", "😃", "😄", "😁", "😆", "😅", "🤣", "😂", "🙂", "😉", "😊", "😇", "🥰", "😍", "🤩", "😘",
      "😋", "😛", "😜", "🤪", "🤗", "🤔", "🤭", "🤫", "😐", "😑", "😶", "🙄", "😏", "😴", "😌", "😎",
      "🤓", "🥳", "😢", "😭", "😤", "😠", "😡", "😱", "😨", "😰", "😥", "😓", "🥺", "😳", "🤯", "😵",
      "🤒", "🤕", "🤢", "🤮", "🥵", "🥶", "😷", "🤝",
    ],
  },
  {
    label: "손·사람",
    icon: "👍",
    emojis: [
      "👍", "👎", "👌", "✌️", "🤞", "🤟", "🤘", "👏", "🙌", "👐", "🙏", "💪", "👋", "🤙", "👈", "👉",
      "👆", "👇", "☝️", "✋", "🖐️", "🤚", "✊", "👊", "🫶", "🫡", "🙇", "🙋", "🤷", "🤦", "💁", "🙆",
    ],
  },
  {
    label: "하트·기호",
    icon: "❤️",
    emojis: [
      "❤️", "🧡", "💛", "💚", "💙", "💜", "🖤", "🤍", "💔", "💕", "💖", "💗", "💯", "✨", "⭐", "🌟",
      "🔥", "💥", "💢", "💤", "🎉", "🎊", "🎁", "🏆", "✅", "❌", "⭕", "❗", "❓", "⚠️", "🚫", "💡",
    ],
  },
  {
    label: "업무",
    icon: "💼",
    emojis: [
      "💼", "📁", "📂", "📄", "📝", "📋", "📌", "📎", "📅", "⏰", "⌛", "📞", "📱", "💻", "🖥️", "🖨️",
      "📧", "📦", "🚚", "💰", "💳", "🧾", "📊", "📈", "📉", "🔧", "🔨", "⚙️", "🔒", "🔑", "🔔", "📢",
    ],
  },
  {
    label: "음식·기타",
    icon: "☕",
    emojis: [
      "☕", "🍵", "🍺", "🍻", "🍕", "🍔", "🍟", "🍚", "🍜", "🍣", "🍰", "🍩", "🍎", "🍓", "🍌", "🍉",
      "🌞", "🌙", "☀️", "⛅", "☔", "❄️", "🌈", "🌸", "🌹", "🐶", "🐱", "🐻", "🐰", "🐧", "🚗", "✈️",
    ],
  },
];

/** 이모지 고르기 팝업. 이모지를 누르면 onPick 으로 넘기고 팝업은 열어 둔다(여러 개 연달아 넣을 수 있게). 바깥을 누르거나 Esc 로 닫힌다. */
export function EmojiPicker({ onPick, onClose }: { onPick: (emoji: string) => void; onClose: () => void }) {
  const [group, setGroup] = useState(0);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) onClose();
    };
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="dialog"
      aria-label="이모티콘 선택"
      className="absolute bottom-full left-3 z-40 mb-2 w-72 rounded-lg border border-border bg-surface shadow-lg"
    >
      <div className="flex border-b border-border">
        {EMOJI_GROUPS.map((g, i) => (
          <button
            key={g.label}
            type="button"
            title={g.label}
            aria-label={g.label}
            aria-pressed={i === group}
            onClick={() => setGroup(i)}
            className={`flex-1 py-1.5 text-lg ${i === group ? "border-b-2 border-primary" : "opacity-60 hover:opacity-100"}`}
          >
            {g.icon}
          </button>
        ))}
      </div>
      <div className="grid max-h-48 grid-cols-8 gap-0.5 overflow-y-auto p-2">
        {EMOJI_GROUPS[group].emojis.map((emoji) => (
          <button
            key={emoji}
            type="button"
            aria-label={emoji}
            onClick={() => onPick(emoji)}
            className="rounded p-1 text-xl leading-none hover:bg-bg"
          >
            {emoji}
          </button>
        ))}
      </div>
    </div>
  );
}
