# エクスポート機能（写真 + CSV ローカル書き出し）

> 撮影 → AI 推定 → 編集 まで完了した商品データを、ローカルに写真フォルダ + CSV で書き出す機能。
> オークタウン取込みのソースデータとして使う。

---

## 2 つの使い方

### 案A: アプリ内エクスポート（スマホ・PC 両対応）

ホーム画面の **「選択」** ボタンから複数商品を選んで一括 ZIP ダウンロード。

1. ホーム画面右上の **「選択」** をタップ
2. エクスポートしたい商品カードをタップして選択
3. 下部の **「エクスポート」** ボタンを押す
4. ZIP がブラウザのダウンロードフォルダに保存される

ZIP 中身:
```
roka_export_2026-05-17.zip
├── {商品ID}/photo_01.jpg, photo_02.jpg, ...
├── okutown_import.csv  ← UTF-8 BOM 付き
└── README.txt
```

エクスポート後、対象商品のステータスは自動的に `exported` に変わる。

---

### 案B: PC ローカル同期スクリプト（大量バッチ向け）

PC 上で `npm run export` を叩いて、Supabase の全商品をローカルに展開する。

```powershell
# 既定: status=ready の全商品を C:\Yahoo\exports\YYYY-MM-DD\ に展開
npm run export

# 全ステータス対象
npm run export -- --status all

# AI 推定済（reviewing）のみ
npm run export -- --status reviewing

# 出力先指定
npm run export -- --output C:\Yahoo\exports\custom

# 指定日以降の商品のみ
npm run export -- --since 2026-05-15

# 特定商品IDのみ
npm run export -- --ids id1,id2,id3
```

出力構成:
```
C:\Yahoo\exports\2026-05-17\
├── {商品ID}/photo_01.jpg, photo_02.jpg, ...
└── okutown_import.csv
```

---

## CSV カラム（v0.1 暫定）

| 列名 | 内容 | 例 |
|---|---|---|
| 商品ID | Supabase UUID | abc-123-def |
| タイトル | AI 推定 + 手動編集後 | ウェッジウッド食器6枚セット |
| カテゴリ | AI 推定カテゴリ | 食器・キッチン > 食器 > 洋食器 > 皿 |
| 状態 | A/B/C/D ランク | A |
| しまう場所 | 倉庫位置 | 棚A-3 |
| 開始価格 | 円 | 4500 |
| 備考 | 編集画面の自由記述 | 目立った傷なし |
| 写真ファイル | パイプ区切り | abc-123/photo_01.jpg\|abc-123/photo_02.jpg |
| ステータス | draft/reviewing/ready/exported | ready |
| 作成日時 | ISO 8601 | 2026-05-17T10:23:45Z |

> ⚠ **CSV のカラム名は v0.1 暫定**。5/20 MTG でおきちゃんに「オークタウン公式テンプレと合うか」を確認してから、v0.2 で正式名にマッピングする。

---

## どちらを使う？

| シーン | おすすめ |
|---|---|
| スマホで撮ったその場で取り出したい | 案A（アプリ内） |
| MTG デモで「撮って → CSV」を見せる | 案A（アプリ内） |
| 1日分・100商品まとめてダウンロード | 案B（PC スクリプト） |
| `C:\Yahoo\exports\` に直接配置したい | 案B（PC スクリプト） |
| サブセット指定（特定IDのみ） | 案B（`--ids`） |

---

## トラブルシュート

| 症状 | 対処 |
|---|---|
| `Failed to fetch` でエクスポートできない | dev サーバーが落ちている可能性。`npm run dev` 再起動 |
| CSV が文字化けする（Excel） | UTF-8 BOM 付きで出力済みなので、Excel 直接ダブルクリックで開ける。LibreOffice の場合は UTF-8 指定で開く |
| 写真が一部欠落 | Supabase Storage の RLS / バケット権限を確認。`get_advisors` で診断 |
| `SUPABASE_SERVICE_ROLE_KEY が必要です` エラー | `.env.local` に環境変数が入っているか確認 |
