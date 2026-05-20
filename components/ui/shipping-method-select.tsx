"use client";

import { useEffect, useMemo, useState } from "react";
import { CARRIER_LABEL, listShippingMethods } from "@/lib/products";
import type { ShippingMethod } from "@/lib/types";

type Props = {
  value: string | null;
  onChange: (id: string | null) => void;
  disabled?: boolean;
};

export function ShippingMethodSelect({ value, onChange, disabled }: Props) {
  const [methods, setMethods] = useState<ShippingMethod[]>([]);
  const [filter, setFilter] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    listShippingMethods().then((result) => {
      if ("methods" in result) setMethods(result.methods);
      setLoading(false);
    });
  }, []);

  const grouped = useMemo(() => {
    const q = filter.trim().toLowerCase();
    const filtered = q
      ? methods.filter((m) => {
          const label = `${CARRIER_LABEL[m.carrier]} ${m.name} ${m.size ?? ""}`.toLowerCase();
          return label.includes(q);
        })
      : methods;
    const map = new Map<string, ShippingMethod[]>();
    for (const m of filtered) {
      const k = m.carrier;
      if (!map.has(k)) map.set(k, []);
      map.get(k)!.push(m);
    }
    return Array.from(map.entries());
  }, [methods, filter]);

  if (loading) {
    return <p className="text-sm text-zinc-500">配送方法を読み込み中...</p>;
  }

  return (
    <div className="space-y-2">
      <input
        type="text"
        value={filter}
        onChange={(e) => setFilter(e.target.value)}
        placeholder="配送方法を検索（例: ゆうパック 80）"
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        disabled={disabled}
      />
      <select
        value={value ?? ""}
        onChange={(e) => onChange(e.target.value || null)}
        className="w-full rounded-md border border-zinc-300 px-3 py-2 text-sm"
        disabled={disabled}
      >
        <option value="">配送方法を選択してください</option>
        {grouped.map(([carrier, items]) => (
          <optgroup key={carrier} label={CARRIER_LABEL[carrier] ?? carrier}>
            {items.map((m) => (
              <option key={m.id} value={m.id}>
                {m.size ? `${m.name}（${m.size}）` : m.name}
              </option>
            ))}
          </optgroup>
        ))}
      </select>
    </div>
  );
}
