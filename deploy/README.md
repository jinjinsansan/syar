# VPS へのデプロイ手順

> ---
> # 🔴 ⚠️ **2026-09-19・WK-5 — この文書は古く、危険でした。**
>
> 🔴 ★**この README は §5 で `deploy/star-worker.service` を入れろと書いていました。**
> ★その unit は ★**2026-08-09 に 7 分の停止を起こした形そのもの**です:
>   ★`ExecStart=/opt/star/node_modules/.bin/tsx apps/worker/src/main.ts`
>   → ★`npm ci --omit=dev` が `tsx` を消す → ★**203/EXEC で即死**（★正典 **D-043**）。
>
> ⚠️ ★**2026-09-14 の監査が既に指摘していました**（`REPORT_AUDIT_20260914.md:127`）。
>    ★**直っていませんでした。** ★**指摘されたのに直っていない、が 2 度目**です
>    （★CLAUDE.md が「Render の記述」で同じことを書いています）。
>
> ✅ ★**unit は `tools/star-worker.service` の 1 本だけ**になりました（★`deploy/` の写しは削除）。
> ✅ ★**配備は `tools/deploy.sh`**（★リリース木 ＋ シンボリックリンク切替）。
>    ★**`git pull` でも `git push` でも入れ替わりません。**
> ---

> ⚠️ ★**「Render」は誤りです**（★2026-09-14 の監査・CLAUDE.md）。★配備先は ★**VPS の systemd `star-worker`** です。
> 正典 §14.2 は実装先を固定していません。
> 要求は **常時稼働・任意の実行時間・状態が前進すること**の3点で、VPS はこれを満たします。
> 名指しで禁止されているのは **Vercel Cron と pg_cron** だけです（実行保証が弱い・§14.2）。

## 0. ★先にやること — 管理画面の二段階認証

このサーバーには **`service_role` キー**（RLS を素通りする鍵）を置きます。
VPS 管理画面が乗っ取られると DB を直接操作されるので、
**インフラを立てる前に二段階認証を設定**してください。

## 1. VPS の準備

- Ubuntu 22.04 LTS 以降 / 2vCPU / 4GB 目安
  （オッズのモンテカルロ 10,000回 × 10分ごとが載る）
- リージョンは Supabase と同じ（東京）を推奨。往復が減る

```bash
sudo adduser --system --group --home /opt/star star
sudo apt-get update && sudo apt-get install -y git

# ★Ubuntu 24.04 以降は OS 標準の Node が十分新しい。まず確認する
apt-cache policy nodejs | head -3
sudo apt-get install -y nodejs npm
node -v      # v22 以上であること

# v22 未満だった場合のみ NodeSource を足す（22.04 など）
#   curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
#   sudo apt-get install -y nodejs
```

⚠️ **NodeSource は新しい Ubuntu に未対応のことがあります**（26.04 など）。
OS 標準で足りるなら足さないでください。

## 2. コードの配置

```bash
sudo -u star git clone <このリポジトリ> /opt/star
cd /opt/star && sudo -u star npm ci
```

## 3. 秘密の配置（★リポジトリに置かない）

```bash
sudo mkdir -p /etc/star
sudo install -m 600 -o star -g star /dev/null /etc/star/worker.env
sudo -e /etc/star/worker.env
```

中身（値はオーナーが入れる）:

```
STAR_ENV=production
DATABASE_URL=          # ★Session pooler（aws-0-....pooler.supabase.com:5432）
SUPABASE_URL=
SUPABASE_SERVICE_ROLE_KEY=
STAR_EPOCH_ISO=        # ★決めたら運用中に動かさない
STAR_SEED_SECRET=      # ★任意。★無くても起動する（★下の註記）
```

### ⚠️ `STAR_SEED_SECRET` について（★監査 M-4・2026-09-19）

★**任意です。★無くても起動します**（★警告だけ出ます）。★起動ごとに作り直されます。

✔ ★**公正性の検証は壊れません**（★`fairness.ts:102`）:
★`seed_commit` と `server_seed` は ★**同じ 1 本の insert で行に入り**（`pg-store.ts:189-196`）、
★検証は ★**両方とも行から読みます。★秘密を使いません。**
→ ★**秘密が起動ごとに変わっても、★過去のレースの検証は通ります。**

⚠️ ★**固定する利点**: ★起動をまたいで同じ列が出ます（★再現・調査のとき）。
🔴 ★**fail-closed にしない理由**: ★いま `STAR_SEED_SECRET` は ★**本番にも staging にも在りません**。
★必須にすると ★**止まるのは本番ではなく staging** です（★監査 M-4 の裁定）。

⚠️ **Direct connection（`db.xxxxx.supabase.co`）は IPv6 専用**で、VPS によっては
到達できません。**Session pooler**（ポート 5432）を使ってください。

⚠️ **`STAR_EPOCH_ISO` は運用開始後に変更できません。** サイクル番号がここから決まるので、
動かすと番号が付け替わり「同じレースを二重に作らない」保証（A-2）が壊れます。

## 4. DB 側の環境宣言（A-7）

```sql
delete from app_environment;
insert into app_environment (singleton, environment) values (true, 'production');
```

★これをしないとワーカーは**起動しません**（意図的な挙動・§14.6）。

## 5. 起動

> 🔴 ⚠️ ★**`deploy/star-worker.service` は削除しました**（★2026-09-19・WK-5）。
>   ★ここには ★**7 分停止を起こした形**（`node_modules/.bin/tsx` ＋ `/opt/star`）が
>   ★残ったままで、★**この手順がそれを入れろと言っていました**。

```bash
# ★unit は tools/ の 1 本だけ（★D-052・2 か所に持たない）
sudo install -m 644 /opt/star/tools/star-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now star-worker
journalctl -u star-worker -f
```

⚠️ ★`tools/star-worker.service` は ★**`/opt/star-current/dist/worker.cjs`**（★素の node・バンドル済み）を
起動します。★**`/opt/star` ではありません。** ★`/opt/star-current` は `tools/deploy.sh` が
張り替える symlink で、★**稼働中プロセスの木を書き換えない**ための構造です。
★ここを `/opt/star` に戻すと、★木を置き換える配備に逆戻りします。

## 6. A-1 / A-2 の実測

```bash
# A-1: 24時間後にレースが生成・確定されているか（プロセス生存ではなく中身を見る）
journalctl -u star-worker --since "24 hours ago" | grep -c "生成="

# ★A-2: 強制終了して再起動しても二重にならないか
sudo systemctl kill -s SIGKILL star-worker   # 周の途中で殺す
sudo systemctl start star-worker
node tools/verify-a2.mjs                      # 重複が0件であることを確認
```

★`SIGKILL` を使うこと。`SIGTERM` だと綺麗に止まるので「壊して確かめる」になりません。
