"use client";

import { useEffect, useRef, useState } from "react";
import { getPhotoSignedUrl } from "@/lib/products";

/**
 * 画像が画面内（手前 200px）に入った時だけ署名 URL を取得する遅延ロード。
 * 一覧に数百枚並んでも初期表示で全件分の署名 URL リクエストが同時に飛ばないようにし、
 * 500 品規模でもスクロールがカクつかないようにするのが目的。
 *
 * 返り値の `ref` を画像コンテナ要素に付与すること。
 */
export function useLazySignedUrl(path: string | null | undefined) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [url, setUrl] = useState<string | null>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setUrl(null);
    setFailed(false);
    const el = ref.current;
    if (!path || !el) return;
    let cancelled = false;

    const load = () => {
      getPhotoSignedUrl(path).then((u) => {
        if (cancelled) return;
        if (u) setUrl(u);
        else setFailed(true);
      });
    };

    // IntersectionObserver 非対応環境では即ロードにフォールバック
    if (typeof IntersectionObserver === "undefined") {
      load();
      return () => {
        cancelled = true;
      };
    }

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((e) => e.isIntersecting)) {
          io.disconnect();
          load();
        }
      },
      { rootMargin: "200px" },
    );
    io.observe(el);

    return () => {
      cancelled = true;
      io.disconnect();
    };
  }, [path]);

  return { ref, url, failed };
}
