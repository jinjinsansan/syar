#!/usr/bin/env bash
#
# ★配備スクリプト — 2026-08-09 に私が起こした7分停止の再発防止
#
# 【何が起きたか】
#   `npm ci --omit=dev` で実行に必要な `tsx` を消したまま `systemctl restart` した。
#   ExecStart のバイナリが無いので 203/EXEC で即死し、10秒間隔で4回試行したあと
#   **systemd が rate limit で諦めた**。7分間、客は馬券を買えなかった。
#
#   ★`Restart=always` は**壊れた配備を救えません**。同じ壊れたものを起動し直すだけです。
#     A-2 が保証したのは「落ちても戻る」で、これは「起動できないものが配備された」です。
#     別の失敗で、再起動ポリシーの外側にあります。
#
# 【この手順の要点】
#   稼働中の Node は**既にコードを読み込み終えています**。だからファイルを置き換えても
#   走っているプロセスは壊れません。**壊れるのは restart した瞬間だけ**です。
#   → 「置き換える → 検証する → 通ったら restart する」の順にすれば、
#     検証で落ちたときは **restart しないので停止時間がゼロ**になります。
#
# 【★このスクリプトの既知の弱点（隠さない）】
#   `npm ci` は node_modules を作り直すので、稼働中のプロセスが
#   **あとから遅延読み込みする**モジュールがあると壊れえます。
#   完全に外すには配備先をリリースごとの別ディレクトリにして symlink を張り替える
#   方式が要ります（無停止・即時ロールバック）。§14 の設計としてはそちらが正しく、
#   これは**その前段の暫定**です。
#
#   ★本番の配備でまだ一度も実行していません。実行するまでは「動くはず」です。
#
# 使い方: bash tools/deploy.sh <コミットSHA>
set -euo pipefail

TARGET="${1:?配備するコミットを指定してください}"
REPO="${STAR_REPO:-/opt/star}"
UNIT="${STAR_UNIT:-star-worker}"
# ★健全性の判定に使う時間。1周 60秒なので、2周ぶん待てば必ず記録が出る
HEALTH_TIMEOUT="${STAR_HEALTH_TIMEOUT:-180}"

cd "$REPO"
PREV="$(git rev-parse HEAD)"
echo "[deploy] $PREV → $TARGET"

git fetch origin --quiet
git rev-parse --verify "${TARGET}^{commit}" >/dev/null

# --- 1. 置き換える（★まだ restart しない。走っているプロセスは影響を受けない） ---
git checkout -q "$TARGET"
# ★--omit=dev を絶対に付けない。tsx は devDependency だが**実行に必要**
npm ci --silent

# --- 2. 検証する（restart する前に、起動できることを確かめる） ---
preflight() {
  # ExecStart が指すバイナリそのものを見る
  [ -x "$REPO/node_modules/.bin/tsx" ] || { echo "[deploy] ★tsx がありません"; return 1; }
  # 依存の網が解けることを確かめる（DB には触れない純ロジックのモジュールを読む）
  # ★`-e` は CJS として評価されるので **top-level await が使えません**。
  #   最初 `await import(...)` と書いたら、健全な木でも必ず落ちました（偽陰性）。
  #   さらに悪いことに、「壊れた木なら落ちる」ことを確かめたつもりの検査まで
  #   **同じ理由で落ちていた**ので、検査が効いているように見えていました。
  #   ★「落ちた」を「検出できた」と読んではいけません。理由を確かめること。
  "$REPO/node_modules/.bin/tsx" -e \
    "import('$REPO/apps/worker/src/cycle-runner.ts').catch((e) => { console.error(e.message); process.exit(1); })" \
    || { echo "[deploy] ★モジュールを読み込めません"; return 1; }
}

if ! preflight; then
  echo "[deploy] ★検証に失敗。$PREV に戻します（★restart していないので停止時間はゼロ）"
  git checkout -q "$PREV"
  npm ci --silent
  exit 1
fi
echo "[deploy] 検証を通過"

# --- 3. restart して、実際に周が回ることを確かめる ---
START="$(date +%s)"
systemctl restart "$UNIT"

healthy() {
  local deadline=$((START + HEALTH_TIMEOUT))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if ! systemctl is-active --quiet "$UNIT"; then
      # ★起動できていない。待っても回復しない（rate limit で諦める側に入る）
      return 1
    fi
    # ★プロセスの生存では見ない（指示書 §3）。周が実際に回った記録を見る
    if journalctl -u "$UNIT" --since "@$START" --no-pager -o cat | grep -q '\[worker\] cycle='; then
      return 0
    fi
    sleep 5
  done
  return 1
}

if healthy; then
  echo "[deploy] ★配備完了 $TARGET（周の記録を確認）"
  exit 0
fi

echo "[deploy] ★健全性の確認に失敗。$PREV に戻します"
git checkout -q "$PREV"
npm ci --silent
START="$(date +%s)"
systemctl restart "$UNIT"
if healthy; then
  echo "[deploy] ★ロールバック完了 $PREV"
else
  echo "[deploy] ★★ロールバックも失敗しました。手で確認してください"
fi
exit 1
