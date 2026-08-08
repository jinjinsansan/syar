# VPS へのデプロイ手順

> 正典 §14.2 は「常時稼働ワーカー（**Render Background Worker 等**）」で実装先を固定していません。
> 要求は **常時稼働・任意の実行時間・状態が前進すること**の3点で、VPS はこれを満たします。
> 名指しで禁止されているのは **Vercel Cron と pg_cron** だけです（実行保証が弱い・§14.2）。

## 1. VPS の準備

- Ubuntu 22.04 LTS 以降 / 2vCPU / 4GB 目安
  （オッズのモンテカルロ 10,000回 × 10分ごとが載る）
- リージョンは Supabase と同じ（東京）を推奨。往復が減る

```bash
sudo adduser --system --group --home /opt/star star
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt-get install -y nodejs git
```

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
```

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

```bash
sudo install -m 644 /opt/star/deploy/star-worker.service /etc/systemd/system/
sudo systemctl daemon-reload
sudo systemctl enable --now star-worker
journalctl -u star-worker -f
```

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
