"use client";

import { Loader2, Mic, MicOff, Plus, Ruler, X } from "lucide-react";
import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { Dimension } from "@/lib/types";
import { cn } from "@/lib/utils";

// SpeechRecognition は標準API（ブラウザによっては webkitSpeechRecognition）
type SpeechRecognitionEvent = {
  results: {
    [key: number]: { [key: number]: { transcript: string } };
    length: number;
  };
};
type SpeechRecognitionInstance = {
  lang: string;
  continuous: boolean;
  interimResults: boolean;
  start: () => void;
  stop: () => void;
  onresult: ((event: SpeechRecognitionEvent) => void) | null;
  onerror: ((event: { error: string }) => void) | null;
  onend: (() => void) | null;
};
type SpeechRecognitionCtor = new () => SpeechRecognitionInstance;

function getSpeechRecognition(): SpeechRecognitionCtor | null {
  if (typeof window === "undefined") return null;
  const w = window as unknown as {
    SpeechRecognition?: SpeechRecognitionCtor;
    webkitSpeechRecognition?: SpeechRecognitionCtor;
  };
  return w.SpeechRecognition ?? w.webkitSpeechRecognition ?? null;
}

// 「身幅52、着丈70 袖丈60.5」のようなテキストから採寸を抽出
export function parseDimensions(text: string): Dimension[] {
  const out: Dimension[] = [];
  const cleaned = text
    .replace(/[、,。\.]/g, " ")
    .replace(/\s+/g, " ")
    .trim();

  // パターン: 「ラベル + 数字 (+ 単位)」
  // 例: 「身幅52cm」「着丈 70」「袖丈60.5センチ」
  const regex =
    /([ぁ-んァ-ヶー一-龯]+?)\s*([0-9]+(?:\.[0-9]+)?)\s*(cm|mm|センチ|ミリ|inch|インチ|g|kg|グラム|キロ)?/g;
  let match: RegExpExecArray | null;
  // eslint-disable-next-line no-cond-assign
  while ((match = regex.exec(cleaned)) !== null) {
    const label = match[1].trim();
    const value = Number(match[2]);
    const rawUnit = (match[3] ?? "cm").toLowerCase();
    const unit: Dimension["unit"] =
      rawUnit === "mm" || rawUnit === "ミリ"
        ? "mm"
        : rawUnit === "inch" || rawUnit === "インチ"
          ? "inch"
          : rawUnit === "g" || rawUnit === "グラム"
            ? "g"
            : rawUnit === "kg" || rawUnit === "キロ"
              ? "kg"
              : "cm";
    if (Number.isFinite(value) && label.length > 0 && label.length <= 8) {
      out.push({ label, value, unit });
    }
  }
  return out;
}

export type DimensionInputProps = {
  value: Dimension[];
  onChange: (next: Dimension[]) => void;
  disabled?: boolean;
};

export function DimensionInput({
  value,
  onChange,
  disabled,
}: DimensionInputProps) {
  const [listening, setListening] = useState(false);
  const [transcript, setTranscript] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [supported, setSupported] = useState(true);
  const recognitionRef = useRef<SpeechRecognitionInstance | null>(null);

  useEffect(() => {
    const Ctor = getSpeechRecognition();
    if (!Ctor) {
      setSupported(false);
      return;
    }
    const rec = new Ctor();
    rec.lang = "ja-JP";
    rec.continuous = false;
    rec.interimResults = false;
    rec.onresult = (event: SpeechRecognitionEvent) => {
      const text = event.results[0]?.[0]?.transcript ?? "";
      setTranscript(text);
      const parsed = parseDimensions(text);
      if (parsed.length > 0) {
        onChange([...value, ...parsed]);
        setError(null);
      } else {
        setError(
          `「${text}」から採寸を抽出できませんでした。例: 身幅52・着丈70・袖丈60`,
        );
      }
    };
    rec.onerror = (event) => {
      setError(`音声認識エラー: ${event.error}`);
      setListening(false);
    };
    rec.onend = () => setListening(false);
    recognitionRef.current = rec;
    return () => {
      try {
        rec.stop();
      } catch {
        // noop
      }
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const start = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec || listening) return;
    try {
      setError(null);
      setTranscript("");
      rec.start();
      setListening(true);
    } catch (e) {
      console.error("[speech] start failed:", e);
      setListening(false);
    }
  }, [listening]);

  const stop = useCallback(() => {
    const rec = recognitionRef.current;
    if (!rec) return;
    try {
      rec.stop();
    } catch {
      // noop
    }
    setListening(false);
  }, []);

  function addEmpty() {
    onChange([...value, { label: "", value: 0, unit: "cm" }]);
  }

  function updateAt(idx: number, patch: Partial<Dimension>) {
    onChange(value.map((d, i) => (i === idx ? { ...d, ...patch } : d)));
  }

  function removeAt(idx: number) {
    onChange(value.filter((_, i) => i !== idx));
  }

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2">
        {supported ? (
          <Button
            type="button"
            variant={listening ? "default" : "outline"}
            size="sm"
            onClick={listening ? stop : start}
            disabled={disabled}
            className={cn(
              listening &&
                "bg-red-500 text-white hover:bg-red-600 animate-pulse",
            )}
          >
            {listening ? (
              <>
                <MicOff className="size-4" /> 停止
              </>
            ) : (
              <>
                <Mic className="size-4" /> 音声で採寸
              </>
            )}
          </Button>
        ) : (
          <span className="text-[10px] text-muted-foreground">
            このブラウザは音声入力非対応
          </span>
        )}
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={addEmpty}
          disabled={disabled}
        >
          <Plus className="size-4" /> 手動追加
        </Button>
      </div>

      {listening && (
        <p className="text-[11px] text-red-600">
          🎤 マイクで話してください（例: 身幅52、着丈70、袖丈60）
        </p>
      )}

      {transcript && !error && (
        <p className="text-[11px] text-muted-foreground">
          認識: <span className="font-mono">{transcript}</span>
        </p>
      )}

      {error && (
        <p className="rounded bg-amber-50 px-2 py-1.5 text-[11px] text-amber-800">
          {error}
        </p>
      )}

      {/* 採寸テーブル */}
      {value.length > 0 ? (
        <div className="space-y-1">
          {value.map((d, idx) => (
            <div key={idx} className="flex items-center gap-1.5">
              <Ruler className="size-3.5 text-zinc-400" />
              <Input
                value={d.label}
                onChange={(e) => updateAt(idx, { label: e.target.value })}
                placeholder="部位"
                className="h-8 w-20 text-xs"
                disabled={disabled}
              />
              <Input
                type="number"
                inputMode="decimal"
                value={d.value || ""}
                onChange={(e) =>
                  updateAt(idx, { value: Number(e.target.value) || 0 })
                }
                placeholder="0"
                className="h-8 w-20 text-xs tabular-nums"
                disabled={disabled}
              />
              <select
                value={d.unit}
                onChange={(e) =>
                  updateAt(idx, { unit: e.target.value as Dimension["unit"] })
                }
                className="h-8 rounded-md border border-input bg-background px-2 text-xs"
                disabled={disabled}
              >
                <option value="cm">cm</option>
                <option value="mm">mm</option>
                <option value="inch">inch</option>
                <option value="g">g</option>
                <option value="kg">kg</option>
              </select>
              <button
                type="button"
                onClick={() => removeAt(idx)}
                disabled={disabled}
                className="ml-auto text-zinc-400 hover:text-destructive"
                aria-label="削除"
              >
                <X className="size-3.5" />
              </button>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-[11px] text-muted-foreground">
          まだ採寸が入力されていません。マイクボタンで音声入力（例「身幅52、着丈70、袖丈60」）か、「手動追加」で1項目ずつ追加できます。
        </p>
      )}
    </div>
  );
}
