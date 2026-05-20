"use client";

import {
  ArrowRight,
  Camera,
  CheckCircle2,
  Download,
  Pencil,
} from "lucide-react";
import Link from "next/link";
import type * as React from "react";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

type Counts = {
  draft: number;
  ready: number;
  exported: number;
  total: number;
};

const STEPS = [
  {
    key: "shoot",
    label: "撮影",
    icon: Camera,
    description: "スマホで連続撮影",
  },
  {
    key: "input",
    label: "メタ入力",
    icon: Pencil,
    description: "状態・配送・しまう場所",
  },
  {
    key: "check",
    label: "完成",
    icon: CheckCircle2,
    description: "完成にして出力対象に",
  },
  {
    key: "export",
    label: "出力",
    icon: Download,
    description: "ZIP（写真+メタ）",
  },
] as const;

export function WorkflowGuide({
  counts,
  onShowDrafts,
  onStartExport,
}: {
  counts: Counts;
  onShowDrafts?: () => void;
  onStartExport?: () => void;
}) {
  const next = nextAction(counts, { onShowDrafts, onStartExport });

  return (
    <div className="mb-6 space-y-3">
      {/* 4 ステップフロー */}
      <div className="rounded-2xl border border-zinc-200/70 bg-white/60 p-3 backdrop-blur-sm">
        <div className="flex items-center justify-between gap-1">
          {STEPS.map((step, idx) => (
            <FlowStep
              key={step.key}
              step={step}
              isLast={idx === STEPS.length - 1}
            />
          ))}
        </div>
      </div>

      {/* 次のアクションガイダンス */}
      {next && (
        <div
          className={cn(
            "flex items-center justify-between gap-3 rounded-2xl border p-3.5 shadow-sm",
            next.tone === "primary"
              ? "border-zinc-900/10 bg-zinc-900 text-white"
              : "border-emerald-200 bg-emerald-50",
          )}
        >
          <div className="flex items-start gap-2.5">
            <div
              className={cn(
                "mt-0.5 flex size-7 flex-shrink-0 items-center justify-center rounded-full",
                next.tone === "primary"
                  ? "bg-white/15 text-white"
                  : "bg-emerald-500 text-white",
              )}
            >
              <next.Icon className="size-3.5" />
            </div>
            <div>
              <p
                className={cn(
                  "text-sm font-semibold",
                  next.tone === "primary" ? "text-white" : "text-emerald-900",
                )}
              >
                {next.title}
              </p>
              <p
                className={cn(
                  "mt-0.5 text-xs",
                  next.tone === "primary"
                    ? "text-white/70"
                    : "text-emerald-700/80",
                )}
              >
                {next.description}
              </p>
            </div>
          </div>
          {next.cta && (
            <Button
              asChild={!!next.cta.href}
              size="sm"
              variant={next.tone === "primary" ? "secondary" : "default"}
              className="flex-shrink-0 rounded-full"
              onClick={next.cta.onClick}
            >
              {next.cta.href ? (
                <Link href={next.cta.href}>
                  {next.cta.label}
                  <ArrowRight className="size-3.5" />
                </Link>
              ) : (
                <span>
                  {next.cta.label}
                  <ArrowRight className="size-3.5" />
                </span>
              )}
            </Button>
          )}
        </div>
      )}
    </div>
  );
}

function FlowStep({
  step,
  isLast,
}: {
  step: (typeof STEPS)[number];
  isLast: boolean;
}) {
  const Icon = step.icon;
  return (
    <>
      <div className="flex min-w-0 flex-col items-center gap-1 px-1 text-center">
        <div className="flex size-9 items-center justify-center rounded-full bg-zinc-100 ring-1 ring-zinc-200">
          <Icon className="size-4 text-zinc-700" />
        </div>
        <div className="min-w-0">
          <p className="text-[11px] font-semibold leading-tight text-zinc-900">
            {step.label}
          </p>
          <p className="hidden text-[10px] leading-tight text-zinc-500 sm:block">
            {step.description}
          </p>
        </div>
      </div>
      {!isLast && (
        <ArrowRight className="size-3.5 flex-shrink-0 text-zinc-300" />
      )}
    </>
  );
}

type NextActionData = {
  tone: "primary" | "success";
  Icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
  cta?: { label: string; href?: string; onClick?: () => void };
} | null;

function nextAction(
  counts: Counts,
  handlers: { onShowDrafts?: () => void; onStartExport?: () => void },
): NextActionData {
  if (counts.total === 0) {
    return {
      tone: "primary",
      Icon: Camera,
      title: "まず最初の商品を撮影しましょう",
      description: "右下の + ボタンから始めます",
      cta: { label: "撮影を始める", href: "/products/new" },
    };
  }

  if (counts.draft > 0) {
    return {
      tone: "primary",
      Icon: Pencil,
      title: `下書きが ${counts.draft} 件あります`,
      description: "状態・配送方法を入力 → 完成にしてエクスポートに進みます",
      cta: { label: "下書きを見る", onClick: handlers.onShowDrafts },
    };
  }

  if (counts.ready > 0) {
    return {
      tone: "success",
      Icon: Download,
      title: `${counts.ready} 件の出品データが完成しています`,
      description: "選択モードでまとめてエクスポートしましょう",
      cta: { label: "エクスポートへ", onClick: handlers.onStartExport },
    };
  }

  return {
    tone: "primary",
    Icon: Camera,
    title: "すべて出力完了です",
    description: "新しい商品の撮影を始めましょう",
    cta: { label: "次の商品を撮る", href: "/products/new" },
  };
}
