#!/usr/bin/env bash
#
# ★配備スクリプト（正典 §14 / D-037）— リリースディレクトリ＋シンボリックリンク切替
#
# 【なぜこの方式でなければならないか】
#   2026-08-09、`npm ci --omit=dev` で実行に必要な `tsx` を消したまま restart し、
#   203/EXEC で即死。10秒間隔で4回試行したあと **systemd が rate limit で諦め**、
#   7分間、客は馬券を買えませんでした。
#   ★`Restart=always` は**壊れた配備を救えません**。同じ壊れたものを起動し直すだけです。
#
#   最初は「同じ木を置き換えてから検証する」順序で直そうとしました。停止時間は減りますが
#   **穴が残ります** — Node は必要になるまで require しないので、
#   稼働中プロセスがまだ読んでいないモジュールを置き換えると、
#   **後で読んだときに新旧が混ざります**。
#
#   → 木を丸ごと別に作り、リンクを張り替える。
#       稼働中プロセスの木は**最後まで変わりません**
#       検証は**新しい木に対して**実行できます
#       ロールバックは**リンクの張り戻しだけ**です
#     7分停止が原理的に起きません。
#
#   /opt/star-releases/<sha>/   ← 新しい木（git archive + npm ci）
#   /opt/star-current -> ...    ← ここを張り替えて restart
#
# 使い方: bash tools/deploy.sh <コミットSHA|ブランチ>
set -euo pipefail

TARGET="${1:?配備するコミットを指定してください}"
REPO="${STAR_REPO:-/opt/star}"
RELEASES="${STAR_RELEASES:-/opt/star-releases}"
CURRENT="${STAR_CURRENT:-/opt/star-current}"
UNIT="${STAR_UNIT:-star-worker}"

# ★健全性の待ち時間。
#   D-035 で M が大きくなったため、**1周に時間がかかります**。
#   λ*=30（M=3,896,104）では本番機で1レース約116秒、起動直後の2本で**約275秒**です。
#   ★180秒 → 600秒 → 900秒 と2度直しました。900秒のまま据え置きます
#     （M を下げたぶん余裕が増えるだけで、短くする理由がありません）。
#   ★**M を動かしたら、この値も一緒に見ること。**設計式で結ばれているのに
#     別々に書ける形になっているのが、2度直した原因です。
#   ★「時間内に出なかった」を「壊れている」と読む誤りで、
#     `-e` の top-level await で検査自体が落ちていたのと同じ形です。理由を先に確かめること。
HEALTH_TIMEOUT="${STAR_HEALTH_TIMEOUT:-900}"
/usr/bin/env true

log() { echo "[deploy] $*"; }

cd "$REPO"
git fetch origin --quiet
SHA="$(git rev-parse --verify "${TARGET}^{commit}")"
DEST="$RELEASES/$SHA"
PREV="$(readlink -f "$CURRENT" 2>/dev/null || true)"

log "目標 $SHA"
log "現在 ${PREV:-（未設定・初回）}"

if [ -n "$PREV" ] && [ "$PREV" = "$(readlink -f "$DEST" 2>/dev/null || echo "$DEST")" ]; then
  log "★既に配備済みです。健全性だけ確認します"
else
  # --- 1. 新しい木を丸ごと作る（★稼働中の木には一切触れない） ---
  mkdir -p "$RELEASES"
  rm -rf "$DEST"
  mkdir -p "$DEST"
  git archive "$SHA" | tar -x -C "$DEST"
  log "木を展開しました $DEST"
  # ★--omit=dev を絶対に付けない。tsx は devDependency だが**実行に必要**
  (cd "$DEST" && npm ci --silent)
  log "依存を入れました"

  # --- 2. 新しい木を検証する（★まだリンクを張り替えない） ---
  preflight() {
    # ExecStart が指すバイナリそのものを見る
    if [ ! -x "$DEST/node_modules/.bin/tsx" ]; then
      log "★tsx がありません"
      return 1
    fi
    # 依存の網が解けることを確かめる（DB には触れない純ロジックのモジュールを読む）
    # ★`-e` は CJS 評価なので **top-level await が使えません**。
    #   `await import(...)` と書くと健全な木でも必ず落ち、しかも
    #   「壊れた木なら落ちる」対照**も同じ理由で落ちる**ので効いて見えます。
    #   ★「落ちた」は「検出できた」ではありません（R-21）。
    if ! "$DEST/node_modules/.bin/tsx" -e \
      "import('$DEST/apps/worker/src/cycle-runner.ts').catch((e) => { console.error(e.message); process.exit(1); })"; then
      log "★モジュールを読み込めません"
      return 1
    fi
  }

  if ! preflight; then
    log "★検証に失敗。★リンクを張り替えていないので**停止時間はゼロ**です"
    rm -rf "$DEST"
    exit 1
  fi
  log "検証を通過"

  # --- 3. リンクを張り替える（mv -T は不可分） ---
  ln -sfn "$DEST" "$CURRENT.new"
  mv -T "$CURRENT.new" "$CURRENT"
  log "リンクを張り替えました → $DEST"
fi

# --- 4. restart して、周が実際に回ることを確かめる ---
healthy() {
  local start="$1"
  local deadline=$((start + HEALTH_TIMEOUT))
  while [ "$(date +%s)" -lt "$deadline" ]; do
    if ! systemctl is-active --quiet "$UNIT"; then
      # ★起動できていない。待っても回復しません（rate limit で諦める側に入る）
      log "★サービスが active ではありません"
      return 1
    fi
    # ★プロセスの生存では見ない（指示書 §3）。周が実際に回った記録を見る
    if journalctl -u "$UNIT" --since "@$start" --no-pager -o cat | grep -q '\[worker\] cycle='; then
      return 0
    fi
    sleep 5
  done
  log "★${HEALTH_TIMEOUT}秒以内に周の記録が出ませんでした"
  return 1
}

START="$(date +%s)"
systemctl restart "$UNIT"
if healthy "$START"; then
  log "★配備完了 $SHA（周の記録を確認）"
  # --- 5. 古いリリースを整理する（直近3つを残す） ---
  # shellcheck disable=SC2012
  ls -1dt "$RELEASES"/*/ 2>/dev/null | tail -n +4 | while read -r old; do
    [ "$(readlink -f "$old")" = "$(readlink -f "$CURRENT")" ] && continue
    rm -rf "$old"
    log "古いリリースを削除 $old"
  done
  exit 0
fi

# --- 6. ロールバック（★リンクを張り戻すだけ） ---
if [ -z "$PREV" ] || [ ! -d "$PREV" ]; then
  log "★★戻す先がありません。手で確認してください"
  exit 1
fi
log "★健全性の確認に失敗。$PREV に戻します"
ln -sfn "$PREV" "$CURRENT.new"
mv -T "$CURRENT.new" "$CURRENT"
START="$(date +%s)"
systemctl restart "$UNIT"
if healthy "$START"; then
  log "★ロールバック完了 $PREV"
else
  log "★★ロールバックも失敗しました。手で確認してください"
fi
exit 1
