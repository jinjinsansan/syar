# Vercel デプロイ手順（正典 §14.2・§14.3）

> ★Vercel は **フロントと読み取り系だけ**（§14.3）。
> レース生成・確定・オッズ算出・ビジネスロジックを置きません。
> それらは VPS のワーカーが担います。

## ⚠️ 環境変数に service_role キーを入れないこと

フロントに置くのは **anon キーだけ**です。`service_role` は RLS を素通りするので、
ブラウザに配ると**誰でも DB を直接操作できます**。

## 1. Vercel にプロジェクトを作る（オーナー作業）

1. https://vercel.com → **Add New → Project**
2. GitHub の `jinjinsansan/syar` を選択
3. **★Root Directory はリポジトリのルート（変更しない）**
   ⚠️ 当初 `apps/web` に設定する想定で書いていましたが、そうすると
      **リポジトリ全体がアップロードされず**、ワークスペースの依存（@star/betting 等）が
      解決できません。ルートの `vercel.json` で `outputDirectory` を指定します。
4. Framework Preset は **Next.js**（自動検出されるはず）

## 2. 環境変数（Vercel の Settings → Environment Variables）

| 名前 | 値 |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `secrets.local.env` の `SUPABASE_URL` と同じ |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | 同 `SUPABASE_ANON_KEY` と同じ |

★`NEXT_PUBLIC_` 接頭辞はブラウザに露出することを意味します。
  **anon キーは露出してよい**（RLS で守る前提）が、`service_role` は絶対に置けません。

## 3. デプロイ後の確認

```
/            番組表が表示される（VPS のワーカーが生成したレース）
/races/<id>  出馬表・オッズ・§8.6 の検証
```

★**確定前のレースで `seed_reveal` が「確定後に公開されます」と出ること**を確認してください。
  ここが値を出していたら A-4 が本番構成で破れています。

## 4. 既知の制約

- **認証は未実装**です。現在は公開情報の閲覧のみで、馬券購入はできません
- ページは `revalidate = 0`（毎回サーバーで取得）。10分ごとに番組が変わるためです
