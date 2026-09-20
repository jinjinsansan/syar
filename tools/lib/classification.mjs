/**
 * ★ツールの分類登録簿（正典 R-24）
 *
 * 【なぜ登録簿にするのか】
 *   最初、書き込み文を機械的に grep して分類しようとしました。**2回外しました**:
 *     1回目 `grep -P` が使えず**全ツールが「読取専用」**と出た（0件は抽出器を疑う）
 *     2回目 `migrate.mjs` を読取専用と判定した — **DDL は .sql 側**にあり、
 *           ツール本体の文字列しか見ていなかった
 *   ★**「何をするツールか」は、ソースの見た目からは決まりません。** 明示します。
 *
 * ⚠️ ★**道具を作ったら、その場でここへ載せること**（★2026-09-08）。
 *    ★開発側は ★**4 回続けて載せ忘れ**、★毎回この検定（R-24）で止まりました
 *    （★`measure-foreleg-drive` / `calm-highlights` / `measure-look-distinctness` /
 *      ★`publish-deformed-art` ほか）。
 *    ★検定が止めてくれるので事故にはなりませんが、★**毎回 1 往復を捨てています**。
 *    ★`tools/*.mjs` を新規に書いたら、★保存する前にここへ 1 行足してください。
 *
 * 【分類】★基準は「**DB の状態を変えるか**」です。ファイル出力の有無ではありません。
 *   readonly       … **DB を変えない**。本番に向けてよい（ファイルを書くものは含みうる）
 *   stateChanging  … 状態を変える。**本番に向けてはならない**（起動時に拒否する）
 *   productionOps  … 本番に向けることが目的の運用ツール。**理由を必ず書く**
 *
 * 【なぜ本番に向けてはならないのか（R-24 の由来）】
 *   `verify-a7.mjs` は `app_environment` を 'development' に固定して終わっていました。
 *   ★ガードが**正しく働くぶん確実に本番ワーカーが起動しなくなり**、しかも
 *     **次の再起動まで顕在化しない**ので、流した本人がその場で気づけません。
 *   `verify-a2.mjs` は `delete from races where cycle_index is not null` で
 *   **本番のレースを全件削除**する実装でした。
 */

/**
 * ★**読むだけ。本番に向けてよい。**
 * ⚠️ ★ここで言う「読むだけ」は ★**「DB を変えない」**の意です（★2026-09-19・TG-4 で明記）。
 *    🔴 ★**ソースを書き換える道具はここに入れないでください** → `SOURCE_MUTATING`。
 *    ★裏取りは **SQL の書き込み文が無いこと**しか見ていないので、★誤って入れても黙って通ります。
 */
export const READONLY = [
  /**
   * ★育成の追いつきの所要を測る（★決め C・2026-09-20・`POOL-DRAIN`）。
   *   🔴 ★**DB に繋ぎません** — ★`pg` を import すらしません。
   *   ★合成の馬に `advanceWeek`（★製品の純関数）を回して 1 頭週あたりの CPU を測り、
   *   ★案 B-3 で決まる頭週の総数（★算術）に掛けるだけです。★出力はログのみ。
   */
  /**
   * ★**着順を再計算して照合する検査の、★費用と露出を測る**（★F-3 案③・2026-09-20）。
   *   🔴 ★**DB に繋ぎません** — ★合成の出走表で製品の `settleRace` を回し、★時間を測るだけ。
   *   ✔ ★実測: ★**1 本 0.11 ms** → ★6,141 本 で ★**約 1 秒**（★CPU のみ）。
   *   → ★★**費用は制約になりません。★N は露出だけで決められます。**
   */
  'measure-recheck-cost.mjs',
  'measure-catchup-cost.mjs',
  /**
   * ★DB の 1 往復にかかる時間を測る（★2026-09-20・`CATCHUP-TOO-SLOW`）。
   *   🔴 ★**`select 1` しか投げません** — ★行を作らず、変えず、消しません。
   *   ★本番に向けても安全です（★実際に production / staging の両方で流しました）。
   */
  'diag-db-roundtrip.mjs',
  /**
   * ★`horses` を参照している表を数え、★消す順を出す（★2026-09-20・世界の作り直しの前提）。
   *   🔴 ★**`pg_constraint` と `count(*)` しか見ません** — ★1 行も作らず、変えず、消しません。
   *   ★順を**印刷するだけ**で、★消しません（★消すのは `seed-world.mjs`）。
   */
  'diag-horses-refs.mjs',
  /**
   * ★**当てようとしている migration が前提にしている「稼働中の定義」を確かめる**
   *   （★2026-09-20・★`db/migrations/0021` の冒頭が自分で要求している照合）。
   *   🔴 ★`create or replace function` は ★**いま在るものを黙って上書きします。**
   *   ⚠️ ★**staging の md5 と比べてはいけません** — ★staging は 53/53 で ★当てた後の姿、
   *     ★本番は 20/53 で ★当てる前の姿。★**一致しないのが正常**で、並べると誤報します。
   *   ✔ ★方法の裏取り: ★staging で ★**ファイルから切り出した本文の md5 と DB の md5 が完全一致**。
   *   ⚠️ ★**読むだけ**。★本番に向けてよい。★ロール一覧も出します（★`0032` の revoke 用）。
   */
  'verify-live-function.mjs',
  /**
   * ★**読まれているのに誰も書かない列**を数える（★**DB-1**・2026-09-20）。
   *   🔴 ★**DB に繋ぎません** — ★`db/migrations/*.sql` と原文だけを見る**静的**な道具です
   *   （★だから CI でも走ります）。★出力はログのみ。
   *   ✔ ★`horses` で ★**2 本**（`bred_this_year` / `coverings_this_year`）。
   *   ✔ ★併せて ★**書く側が `tools/` にしか無い列 23 本**も出します（★`POOL-SUPPLY` の姿）。
   */
  'diag-write-never.mjs',
  /**
   * ★**憲法の遵守（正典 §17.2 C-1〜C-5）を、★コードで確かめる**（★2026-09-20）。
   *   🔴 ★**DB に繋ぎません。★読むだけ**です（★静的・★CI でも走ります）。
   *   ★`git ls-files` ではなく ★**追跡外も歩きます**（★§17.2 が `rg -uu` と指定・**M-6**）。
   *   🔴 ⚠️ ★**この道具が緑でも「憲法を守っている」ではありません** —
   *     ★C-4 は**配線**だけ、★C-5 は**機械では閉じられません**（★探す語を置くこと自体が違反）。
   *     ★そう出力に書いてあります。★**混同しないこと**（★**R-21**）。
   */
  /**
   * ★**公開中のサイトが、★意図した範囲しか開いていないか**（★2026-09-20・①② の検査）。
   *   🔴 ★**読むだけ**（★HTTP の GET のみ・★DB に触れません）。
   *   🔴 ★`--expect protected|open` が ★**必須** — ★★見つけた世界をそのまま合格にしないため。
   *   ⚠️ ★対照を同じ検査に入れます（★**CK-14**）。★bypass の token は環境変数から読み、★出力に出しません。
   */
  'verify-prod-exposure.mjs',
  'verify-constitution.mjs',
  /**
   * ★**C-6: 持ち主本人にも素質の生値が出ていないか**（★正典 §17.2・§12.4・D-114・2026-09-20）。
   *   🔴 ★**読むだけ** — ★`information_schema` と `has_column_privilege` だけ。★1 行も変えません。
   *   ★`verify-anon-exposure` は **anon**、★こちらは ★**`authenticated`（本人）**を見ます。
   *   ✔ ★2026-09-20 実測: ★staging ✅ / ★production は ★**③ の対照が落ちる**
   *     （★`my_horses` が無い ＝ `SCHEMA-DRIFT-PROD` の姿）。
   */
  /**
   * ★**確定した着順を、★保存された seed から再計算して照合する**（★F-3 案③・2026-09-20）。
   *   🔴 ★**読むだけ**（★`select` のみ）。★`--record` のときだけ `evidence/` に 1 ファイル書く。
   *   ⚠️ ★**いまは判定に使えません** — ★どの版が確定させたかの記録が無く、
   *     ★食い違いが「書き換え」か「版の差」か分けられません（★`F3-RECOMPUTE-NEEDS-VERSION`）。
   */
  'verify-race-recompute.mjs',
  'verify-c6-owner-exposure.mjs',
  /**
   * ★AL-6（裁定 REVIEW_CONSULT_ARCADE_LOOP_ANSWER_20260918）の測定器 2 本。
   *   ★DB に触りません（★エンジンを回して時間を測るだけ・出力はローカルの JSON とログ）。
   *   ★レビュー側が独立に再実行できるよう tmp/ から移しました（★tmp/ は gitignore で次の人に残らない）。
   */
  /**
   * ★勝ち上がりの流量を測る（CL-7・指示書 DEV_INSTRUCTIONS_RACE_CLASS_20260918）。
   *   ★select だけ。DB を変えません（★資格のある馬の数と、1 日の枠の本数を突き合わせるだけ）。
   */
  /**
   * ★帯（段）の分布を見る（★T-10 の後始末・裁定 `REVIEW_T10_STARS_24_VERDICT_20260918.md`）。
   *   ★DB に触りません（★エンジンを回してプールの段を数えるだけ・出力はログのみ）。
   *   ★`tmp/` から移しました（★`tmp/` は gitignore で次の人に残らない・AL-6 と同じ理由）。
   *   ⚠️ ★AL-11（較正の取り直し）で使います — ★帯が 24 段になり、束ね方を決める材料になります。
   */
  /**
   * ★機械編集の後始末 — ★制御文字・見えない空白が混ざっていないか走査する
   *   （★2026-09-19・裁定 `REVIEW_UI1_SELECTION_RULE_VERDICT_20260919.md`。★レビュー側も使います）。
   *   ★ファイルを読むだけです。★DB にも網にも触れません（`--changed` は `git status` を 1 回呼ぶだけ）。
   * 🔴 ★**道具自身が最初に自分を赤くしました** — ★註記の「例」が実体の不可視文字になっていました。
   *   → ★探す文字をコードポイントから組み立てる形に直してあります。
   */
  'scan-control-chars.mjs',
  /** ★較正定数の一覧を出す（★変異試験の入力）。★読むだけ・DB に触れない */
  'mutation/dump-calibration.ts',
  /**
   * ★参考映像を Blender で描くスクリプト。★**Blender が実行します**（★node ではありません）。
   * ★DB にも網にも触れず、★画像を書き出すだけです。
   */
  'blender/race_render.py',
  'probe-band-histogram.ts',
  /**
   * ★芝の粒を測る（★映像の便）。★画像を読むだけで DB に触りません。
   *   ⚠️ ★**2026-09-19 まで分類簿に載っていませんでした** — ★検査が `.mjs` だけを見ていたためです
   *      （★`tool-guard.test.ts` の走査を `.ts` にも広げて、ここに載せました・R-24）。
   */
  'measure-turf-grain.ts',
  'measure-class-flow.mjs',
  /**
   * ★1 周の読み込みの所要を頭数に対して測る（CF-5・裁定 REVIEW_CF1_STEADY_STATE_VERDICT_20260918）。
   *   ★select だけ。DB を変えません（★上限を振って伸びを見るだけ）。
   */
  'measure-cycle-load.mjs',
  'bench-odds-entrants.mjs',
  'bench-odds-cost.mjs',
  // ★既存の利用者から「経路の印」（auth.identities）を読むだけ。SELECT のみ・何も作らない
  //   （D-113 ③・裁定 REVIEW_AUTH_EMAIL_PASSWORD_VERDICT_20260918 §2）
  'read-auth-identities.mjs',
  // ★認証の設定の現在値を読む（GET /auth/v1/settings 1 本）。E-6・E-8 の判定に使う（裁定 C-3）
  'read-auth-settings.mjs',
  /**
   * ★デザイナーのカードを配信先へ写す（★2026-09-17・オーナー指示
   *   ★「★デザイナーが作った全てのページを（略）開発サーバーで見れるように」）。
   *   ★`design/hud-ds/components/<名>/index.html` → `apps/web/public/ds/` と
   *   ★`design/hud-ds/styles.css` → `apps/web/public/styles.css`。
   *   ⚠️ ★ここに `<名>` と書いているのは、★星印とスラッシュを並べると
   *      ★**この註記そのものが閉じてしまう**からです（★2026-09-17 に 1 度やりました）。
   *
   * ⚠️ ★`apps/web/public/ds/` を ★**消してから入れ直します**（★消えたカードを残さないため）。
   *    ★それでも分類は **readonly** です — ★分類の基準は「★**DB の状態を変えるか**」であり、
   *    ★ファイル出力の有無ではないと、★この簿の冒頭に明記されています。★DB には触れません。
   *
   * 🔴 ★**私はこの登録を忘れ、R-24 の検定で止められました**（★2026-09-17）。
   *    ★簿の冒頭に「★開発側は 4 回続けて載せ忘れた」とあり、★**私で 5 回目**です。
   *    ★`tools/*.mjs` を書いたら、★**保存する前にここへ 1 行**足すこと。
   */
  'sync-ds.mjs',
  /**
   * ★4 コーナーの「絵を回す／回さない」「芝の目」を並べて撮る（★2026-09-11）。
   *   ★`/race` を読むだけ。★出力は `out/tilt-compare/` と見比べ台の素材のみ。
   *   ⚠️ ★DB に触れない。★製品のコードも変えない（★URL のパラメータで撮り分ける）。
   */
  'capture-tilt-compare.mjs',
  /**
   * ★レースを頭から終わりまで 1 本で撮る（★2026-09-12・★計画書 工程 3）。
   *   ★`/race` を画面の既定のまま読むだけ。★出力は `out/race-through/` と見比べ台の映像のみ。
   *   ⚠️ ★DB に触れない。★尺は画面のシークの `max` から取る（★手置きしない）。
   */
  'capture-race-through.mjs',
  /**
   * ★画面の細かさを測る（★2026-09-12・★引継ぎ書 §3「壊していないことの測り方」）。
   *   ★`/race` を画面の既定のまま読むだけ。★出力は `out/render-scale/` のみ。
   *   ⚠️ ★DB に触れない。★製品のコードも変えない（★オーナーの画面と同じ 1152 CSS px・dpr 1.5 で開く）。
   */
  'measure-render-scale.mjs',
  /**
   * ★芝の目が「どちらへ動くか」を測る（★2026-09-12・★オーナー指摘③）。
   *   ★`/race` を読むだけ。★出力は `out/turf-flow/` のみ。
   *   ⚠️ ★DB に触れない。★製品のコードも変えない（★`?grain=flat` は既にある戻し口）。
   */
  'measure-turf-flow.mjs',
  /**
   * ★コーナーにコーナーのカットが当たっているかを 50 鞍で測る（★2026-09-12・★オーナー指摘）。
   *   ★走路と台本を読むだけ。★画面も開かない。★出力は標準出力のみ。
   */
  'measure-corner-coverage.mjs',
  /**
   * ★カットの境目で馬の大きさが跳ぶかを測る（★2026-09-12・★オーナー指摘
   *   「真横カメラワークでの切り替わりでレースがつながっている感がない」）。
   *   ★画面と同じ経路（`resolveBroadcastV2Scene`）を読むだけ。★出力は標準出力のみ。
   *   ⚠️ ★DB に触れない。★合否は出さない（★閾値はオーナー判断・R-16）。
   */
  'measure-cut-scale.mjs',
  /**
   * ★展開（逃げ切り／差し／追い込み）が seed でどれだけ出るかを数える（★2026-09-12・オーナー指示②）。
   *   ★画面と同じ組み立て（`buildAuditRace`）を読むだけ。★出力は標準出力のみ。
   *   ⚠️ ★DB に触れない。★合否は出さない（★閾値はオーナー判断・R-16）。
   */
  'measure-race-development.mjs',
  /**
   * ★レースの音が場面どおりの秒に鳴っているかを数える（★2026-09-13・オーナー支給の音源）。
   *   ★`AudioContext` を差し替えて、★鳴らし始めた時刻と音源の読み込みを記録するだけ。
   *   ⚠️ ★DB に触れない。★合否は出さない（★聴いて判断するのはオーナー・R-16）。
   */
  'check-race-sound-dev.mjs',
  /**
   * ★勝負服の窓が鞍布だけを覆えているかを測る（★2026-09-13・オーナー評「★また縦縞模様」）。
   *   ★素材 PNG を復号して、★画面と同じ `silksPaintable` で塗る画素を数えるだけ。
   *   ⚠️ ★DB に触れない。★合否は出さない（★窓の置き場はこの数字を見て決める・R-16）。
   */
  'measure-silks-window.mjs',
  /**
   * ★LP と内装のページを実際に開いて、★例外と見た目を記録する（★別セッション作・★2026-09-13）。
   *   ★ヘッドレスで開いて撮るだけ。★出力は `out/` 配下。
   *   ⚠️ ★DB に触れない（★実測: supabase / insert / update / delete いずれも 0 件）。
   *   ⚠️ ★分類の登録漏れだったものを、★TOP の移設に合わせて登録（★R-24）。
   */
  'check-lp-preview.mjs',
  'check-story-interiors.mjs',
  /**
   * ★最後の直線で展開ごとにどれだけ引くかを測る（★2026-09-12・オーナー指示⑤）。
   *   ★画面と同じ経路（`resolveBroadcastV2Scene`）を読むだけ。★出力は標準出力のみ。
   *   ⚠️ ★DB に触れない。★合否は出さない（★閾値はオーナー判断・R-16）。
   */
  'measure-finish-framing.mjs',
  /**
   * ★地面タイルの焼き込み横縞を平したものを作る（★2026-09-11・★案 A）。
   *   ★`world-turf.png` を読み、★`world-turf-flat.png` を**新規に**書く。
   *   ⚠️ ★元のタイルは上書きしない。★DB に触れない。
   */
  'bake-turf-flat.mjs',
  /**
   * ★編集台本 v5 の比較動画（`/race?cinematography=v5`）。
   *   フラグの有無で撮り比べるだけ。レース状態・順位・素材・HUD は変えない。
   *   出力は `out/2d-script-v5/` のみ。
   */
  'capture-script-v5.mjs',
  'render-script-v5-sheets.mjs',
  /**
   * ★編集文法の監査（参考映像と通常 /race のカット割り比較）。読むだけ。
   *   ⚠️ ★改善動画は作らない。出力は `out/2d-edit-grammar/` のみ。
   */
  'audit-edit-grammar-reference.mjs',
  'audit-existing-shot-gate.mjs',
  'render-existing-shot-gate-sheets.mjs',
  'capture-existing-shot-actual.mjs',
  'render-existing-shot-actual-sheets.mjs',
  'audit-edit-grammar-race.mjs',
  'capture-edit-grammar-race.mjs',
  'render-edit-grammar-comparison.mjs',
  /**
   * ★俯瞰で「ぴょんぴょん」する件（#1）の判断材料。読むだけ。
   *   仮の完歩・代替カメラは道具の中だけで組む。製品のカメラ定義・台本・素材には触れない。
   *   出力は標準出力のみ（ファイルを書かない）。
   */
  'audit-overhead-stride.mjs',
  'audit-overhead-stride2.mjs',
  /**
   * ★#1「ぴょんぴょんする」の実画面での確認（2026-08-25）。読むだけ。
   *   `capture-overhead-stride.mjs` … 通常 `/race` を本物のブラウザで開き、指定ショットの
   *     前後を 30fps で取り込む。★オフライン描画では勝負服 overlay と毛色の焼き込みを
   *     通らないので、オーナーと同じ絵を見るには実画面から撮るしかない（R-30）。
   *   `render-overhead-stride-compare.mjs` / `render-corner-direction-compare.mjs`
   *     … 撮ったコマを並べて動画と GIF にするだけ。
   *   `audit-hop-vs-reach.mjs` … 素材 8 コマの画素から「胴の上下」と「脚の伸び縮み」を測る。
   *   出力は `out/2d-overhead-stride/` と標準出力のみ。
   */
  'capture-overhead-stride.mjs',
  'render-overhead-stride-compare.mjs',
  'render-corner-direction-compare.mjs',
  'audit-hop-vs-reach.mjs',
  /**
   * ★「攻防を見せたい」という要望の判断材料（2026-08-25）。読むだけ。
   *   `audit-shot-coverage.mjs` … 各カットで何頭が画面に入り、何頭が実際に争っているか
   *   `audit-finish-contest.mjs` … エンジンがゴール前に何頭の競り合いを出しているか（40 レース）
   *   ★カメラは「あるもの」しか映せない。まず在るかどうかを数えるための道具。
   *   出力は標準出力のみ。
   */
  'audit-shot-coverage.mjs',
  'audit-finish-contest.mjs',
  /**
   * ★曲がり方が「かくかく」する件の測定（2026-08-25）。読むだけ。
   *   1 カットの中で素材の入替・左右反転が何回起きるかを数える。
   *   ⚠️ ★反転を「カット中は固定」にする案は、カット後半で向きが逆になるため取り下げた
   *      （オーナー評「全員斜めになりながら曲がっている」）。いまは毎コマの判定に戻っている。
   */
  'audit-corner-turn.mjs',
  /**
   * ★「斜め向いたまま曲がる」件の測定（2026-08-25）。読むだけ・標準出力のみ。
   *   固定カメラの据え位置を総当たりして**掃引が消せないこと**を示し、
   *   追従カメラにしたときの向きの角度と馬の大きさを出す。製品コードには触れない。
   */
  'audit-corner-camera.mjs',
  /**
   * ★着差の見せ方（γ）の検証と比較映像（指示書 `DEV_INSTRUCTIONS_P4_FINISH_CONTEST_20260825.md`）。読むだけ。
   *   `verify-time-gap-shape.mjs` … 既定が 1 ビットも動かないこと・着順が変わらないこと・
   *     解析値と位置モデルの一致比を測る。★写像の差し替えは**道具の中だけ**（本番既定に触れない・I-5）
   *   `render-contest-compare.mjs` … 撮ったコマを γ ごとに並べて動画にするだけ
   *   出力は `out/2d-finish-contest/` と標準出力のみ。
   */
  'verify-time-gap-shape.mjs',
  'render-contest-compare.mjs',
  /** ★γ を上げたときの密集の副作用（重なり・HUD の裏）を数える。読むだけ・標準出力のみ */
  'audit-contest-overlap.mjs',
  /**
   * ★馬同士の前後・左右の間隔と横移動の速さを、旧版（`?motion=legacy`）と新版で並べて測る
   *   （★2026-09-09・`REPORT_P4_TRAFFIC_MOTION_20260909.md`）。
   *   ⚠️ ★測るのは**地面の上の位置**であって、透視投影で画面上の馬体が重なるかではありません。
   *   レース結果は読むだけ。DB にも外部にも接続しない。出力は `out/traffic-motion/audit.json` のみ。
   */
  'audit-traffic-motion.mjs',
  // ★編集文法の監査で使う共通部品（読取専用）
  //   cdp.mjs = Chrome DevTools Protocol の最小クライアント
  //   race-audit-build.mjs = 実画面と同じ手順でレースを 1 本組む
  // ★世界に置く看板（発馬機など）の実寸を確かめる。読むだけ
  //   2026-08-21: 発馬機が実物の 1.65 倍の高さで置かれ、**馬の頭が扉に隠れて脚しか見えない**状態を見逃していた
  'verify-world-billboards.mjs',
  // ★ゲート待機・開扉の瞬間を本番と同じ描画で静止画にする。読むだけ
  'shot-gate.mjs',
  // ★**実レース**の任意の秒数を本番と同じ描画で静止画にする。読むだけ
  //   `audit-broadcast-v2.mjs` は馬の位置が合成データなので、実際の団子具合が映らない
  'shot-race-at.mjs',
  /**
   * ★2D 馬群描画の限界テスト（`DEV_INSTRUCTIONS_P4_2D_LIMIT_TEST_20260822.md`）。
   *   レース結果は読むだけ。DB にも外部にも接続しない。出力は `out/2d-pack-limit/` のみ。
   */
  'render-2d-pack-limit.mjs',
  /**
   * ★参考映像をコマに切って「せめぎ合い」と馬の見かけの大きさを測る。
   *   動画ファイルは引数で受け取るだけ。DB にも外部にも接続しない。
   *   ⚠️ ★画面の幾何と時間だけを数字にする（絵を写さない・憲法1）。出力は `out/contest-video/` のみ。
   */
  'measure-contest-video.mjs',
  /**
   * ★台本 v4 / v5 と γ 別に「馬が画面のどれだけを占めるか」を測る。
   *   `resolveBroadcastV2Scene` を読むだけ。レース結果・カメラ・台本を変えない。
   */
  'audit-horse-size.mjs',
  /**
   * ★**馬が画面上で何 px で描かれるか**を測る（★引継ぎ書 §0-4 の答え・2026-09-02）。
   *   ★焼き込みの解像度を決めるための上限を出すだけ。★読むだけ。
   *   ★描画コードの式（`hpx = HORSE_HEIGHT_M * pxPerM`）と素材の不透明範囲を突き合わせる。
   *   ★10 場・50 鞍すべてを回す（★1 場だけで決めない・R-33）。★出力は標準出力のみ。
   */
  'audit-draw-scale.mjs',
  /**
   * ★本番で動いているのが手元のどのコミットかを突き合わせる（★正典 R-28・2026-09-02）。
   *   ★HTTP で /api/healthz を 1 本読むだけ。★DB に触れない。★本番に向けてよい読取専用。
   *   ⚠️ ★push のたびに回すこと。★検定に入れられないのは、検定が本番へ出られないため。
   */
  'verify-deployed-build.mjs',
  /**
   * ★直線の画角を広げた前後を並べた比較動画。撮ったコマを読んで並べるだけ。
   *   レース状態・順位・素材・HUD は変えない。出力は `out/2d-overhead-stride/` のみ。
   */
  'render-stretch-fov-compare.mjs',
  /**
   * ★第4コーナーの「向き」を直した前後を並べた比較動画。撮ったコマを読んで並べるだけ。
   *   レース状態・順位・素材・HUD は変えない。出力は `out/2d-overhead-stride/` のみ。
   */
  'render-turn-facing-compare.mjs',
  /**
   * ★レース終盤の再構築（指示書 `DEV_INSTRUCTIONS_P4_RACE_CLIMAX_REBUILD_20260826.md`）。すべて読むだけ。
   *   `audit-corner-cut-window.mjs`    … 4 角のカット境界と向きの角度の対応
   *   `audit-corner-camera-sweep.mjs`  … 固定カメラの据え位置の掃引（★式の写し・候補を絞る用）
   *   `audit-climax-contest.mjs`       … §4-3 の攻防の定量条件（演出 ON/OFF を並べて測る）
   *   `audit-winner-closeup.mjs`       … §5 の勝馬クローズアップ（切替・長さ・馬高比・切れ）
   *   出力は標準出力のみ。レース状態・順位・素材・HUD は変えない。
   */
  'audit-corner-cut-window.mjs',
  'audit-corner-camera-sweep.mjs',
  'audit-climax-contest.mjs',
  'audit-winner-closeup.mjs',
  /**
   * ★同じ指示書の続き（2026-08-26）。すべて読むだけ・出力は標準出力のみ。
   *   `audit-climax-invariance.mjs` … §7-1 演出 ON/OFF で着順・タイム・着差・払戻・カット境界が一致するか
   *   `audit-climax-camera.mjs`     … §4-4 主役 5 頭が画面幅のどれだけを占めるか／注視点・画角の連続性
   *   `audit-climax-release.mjs`    … 演出の掛け・戻しで馬の「見かけの速さ」が本来から何 % ずれるか
   */
  'audit-climax-invariance.mjs',
  'audit-climax-camera.mjs',
  'audit-climax-release.mjs',
  /**
   * ★台本 v6（直線をカットで割る）の測定（2026-08-26）。すべて読取専用・標準出力のみ。
   *
   *   `audit-straight-spread.mjs`  … 上位 5 頭が実際に何 m に伸びているか／その大きさで画面に入るか
   *   `audit-real-overtakes.mjs`   … ★演出なしで直線に追い抜きが実在するか（在らなければ映せない）
   *   `audit-contest-focus.mjs`    … 競り合いが画面に映っている秒数／注視点が馬から離れる量
   */
  'audit-straight-spread.mjs',
  'audit-real-overtakes.mjs',
  'audit-contest-focus.mjs',
  /**
   * ★**せめぎ合いになる seed を総当たりで探す**（2026-08-26）。読取専用・標準出力のみ。
   *   ⚠️ ★エンジンにも表示にも手を入れません。**見るレースを選ぶ**ための道具です。
   */
  'find-contest-seeds.mjs',
  /**
   * ★**カットの「境目」でつながっているか**を測る（2026-08-27・オーナー指摘③）。
   *   読取専用・標準出力のみ。DB にも製品コードにも触れません。
   *
   *   ⚠️ ★既存の `verify-camera-continuity.mjs` は `prev.id === cur.id` の判定で
   *      **カットが変わったコマを捨てており**、境目は一度も測られていませんでした。
   *      あちらは「カットの*中*でカメラが瞬間移動していないか」の道具なので、担当の外です。
   */
  'audit-cut-seam.mjs',
  /** ★攻防演出の ON/OFF を並べた比較動画。撮ったコマを読んで並べるだけ */
  'render-climax-compare.mjs',
  /** ★撮ったコマを 1 本の動画にするだけ（§8-A / §8-C）。出力は `out/2d-overhead-stride/` のみ */
  'render-climax-clip.mjs',
  'render-2d-pack-compare.mjs',   // 上の出力と参考映像を並べるだけ。読むだけ
  // ★以下は計測用の使い捨て（`_` 始まり）。すべて読むだけ
  'verify-horse-motion.mjs',  // 馬を世界に固定しコマだけ送り、素材由来のぶれを切り分ける
  'sweep-lane-reveal.mjs',    // 横の広がりの帯を掃引する（読むだけ）
  'verify-cut-timing.mjs',    // 台本の各カットが実際に何秒あるかを測る（読むだけ）
  'verify-stride-rate.mjs',   // 画面上で 1 秒に何完歩しているかを測る（読むだけ）
  'verify-v17-time.mjs',      // V-17（走破タイムの分布）を測る（読むだけ）
  /**
   * ★`_` 始まりは `.gitignore` で追跡外ですが、★**この検査の対象からは外れません**
   *   （登録簿は「作業ツリーにある `tools/*.mjs`」を見るため）。
   *   ⚠️ ★`_gammaprobe.mjs` は 2026-08-27 の前便で作られ、**登録されていませんでした**。
   *      そのためテストは赤のままで、前便の「1181 件 PASS」は作成時点で失効していました（R-23）。
   */
  'verify-camera-continuity.mjs', // カメラがカットの中で跳んでいないか（読むだけ）
  'verify-horse-smoothness.mjs',  // 馬 1 頭ごとの画面上の動きが滑らかか（読むだけ）
  'verify-shot-stability.mjs',    // B-2 その秒で撮った 1 コマが繰り返し撮って同じかを測る（読むだけ）
  'verify-mobile-layout.mjs',     // 全ページがモバイル幅で横あふれしないかを実ブラウザで測る（読むだけ）
  'slice-narrator.mjs',       // ナレーターのシートを 6 枚に切り、口だけ差し替える（読むだけ）
  'verify-no-real-faces.mjs', // 人物立ち絵に写真が混ざっていないか（読むだけ）
  // ★anon で何が読めるかの全数確認（§8.6 server_seed・§12.4 potential）。select のみ
  'verify-anon-exposure.mjs',
  // ★既知の赤の照合（★RD-2・2026-09-19）。★npm test を流して名前を突き合わせるだけ。DB に触らない
  'verify-known-red.mjs',
  /**
   * ★**まだ直っていない指摘の期限を見る**（★**NT-3**・2026-09-19）。
   * ★**DB に繋ぎません。** ★簿（`lib/open-findings.mjs`）の `until` と書き漏れを見るだけ。
   * ★門（`tools/gate.mjs`）から呼ばれます。★`verify-known-red.mjs` の隣に置きます。
   */
  'verify-open-findings.mjs',
  'a3-converge.mjs',
  // ★読むだけ（★ソースを読むだけ・DB に繋がらない）。★**CK-11**: ★数えて印刷して、
  //    ★**合否に入っていない数**を探す。2026-09-19 に同じ走査を**使い捨て**で書いて捨て、
  //    🔴 ★**「24 / 5 / 4 を誰も再現できない」**と指摘されたので道具にした。
  //    ⚠️ ★目安です（★網を 3 回 書き直した記録が頭にあります）。
  // 🔴 ★読むだけ（`select` のみ）。★厩舎ごとの頭数と ★**馬 1 頭ずつの所属**を採り、
  //    ★前後で突き合わせる（`--save` / `--compare`・2026-09-20）。
  //    🔴 ★`STABLE-1-SKEW` は **66 頭ずれてから**見つかった — ★**ずれたその場で分からなかった**のが本体。
  //    ⚠️ ★頭数だけでは入れ替わりが見えないので、★`id → 厩舎` の sha256 も見る。
  //    ⚠️ ★引退込みで採る（★現役で絞ると `verify-b1` の 1 頭が見えない）。
  // 🔴 ★読むだけ（`select` のみ）。★ワーカーが進んでいるかを切り分ける（2026-09-20）。
  //    ⚠️ ★`assertNotProduction` を**呼びません** — ★**本番を見るのが目的**だから。
  //    ★そのかわり接続先を必ず最初に出します。
  //    ✔ ★これで 2026-09-19 に分かったこと: ★staging は止まっているが ★**本番は生きている**。
  //    ★そして 🔴 ★**本番の `birth_week` が全頭 null**（★育成が一度も走っていない）。
  // ★読むだけ（`select 1` のみ）。★証明書の固定が効いているかを、★**対照つき**で見る（2026-09-20）。
  //    🔴 ★「固定して繋がりました」だけでは ★**何を渡しても通る**のかもしれない。
  //    ★通る 1 本と ★**落ちる 2 本**（CA 無し／別の CA）を対で採る。
  //    ⚠️ ★本番にも向けられる（★読むだけなので R-24 の対象外）。
  'verify-tls-pinning.mjs',
  // ★読むだけ（`select` のみ）。★**実際に走ったレース**から V-4 / V-5 / V-6 を数える（2026-09-20）。
  //    🔴 ★この数字を**較正の根拠に使わないこと** — ★本番の馬は育っていない（`PROD-NEVER-AGED`）。
  //    ★言えるのは「模型と実物がどれだけ離れているか」まで。
  'diag-live-gates.mjs',
  // ★読むだけ（`select` のみ）。★**1 レースの中の能力の散らばり**を測る（2026-09-20）。
  //    ★V-4 を決めている当の量に降りるための道具（★V-4 は遠い量）。
  //    ⚠️ ★能力は `baseScore(stats, distance)` で採る（★R-30: ★レースに渡された値）。
  //    ⚠️ ★本番に限っては、★馬が一度も育っていないので ** 今の stats ＝ 当時の stats**。
  'diag-field-dispersion.mjs',
  'diag-worker-alive.mjs',
  'diag-stable-census.mjs',
  'diag-printed-only-counts.mjs',
  // 🔴 ★読むだけ（`select` のみ）。★`STABLE-1-SKEW` の原因を、★跡を消さずに探す（2026-09-19）。
  //    ★簿に「直さないこと — 原因が分かる前に動かすと跡が消えます」と在るので、1 行も書かない。
  //    ✔ ★これで原因が出ました: ★`verify-prize.mjs` の `npc_stable_id = 1` の決め打ち。
  'diag-stable1-skew.mjs',
  // ★読むだけ。ゲージ（余力）が正しい向きを向いているかを見る
  'diag-gauge.mjs',
  // ★読むだけ。映像に抜き差し（追い抜き・先頭交代）があるかを数える
  'diag-overtake.mjs',
  // ★読むだけ。展開の計算を消して、描画コマンドが変わるかを見る（R-16 を逆向きに）
  'diag-tenkai.mjs',
  // ★読むだけ。同じ出走表で乱数だけ変え、レースに不確定さがあるかを見る
  'diag-uncertainty.mjs',
  // ★読むだけ。画面に描かれた情報だけを見るボットで「読めるか」を測る
  'verify-readable.mjs',
  // ★読むだけ。V-16 の①②③④をまとめて判定する
  'verify-v16.mjs',
  // ★読むだけ。V-17（レースがレースに見えるか）を判定する
  'verify-v17.mjs',
  // ★読むだけ。V-18（枠順が結果を決めないこと・距離ロスは実在すること）
  'verify-v18.mjs',
  // ★読むだけ。オッズ計算時と確定時の出走馬を突き合わせて数字を並べる
  'diag-b6.mjs',
  // ★読むだけ。生成時と保存時のレース条件を突き合わせる
  'diag-conditions.mjs',
  // ★読むだけ。本番の馬をそのまま書き出してハーネスに食わせる
  'export-pool.mjs',
  /**
   * ★**集団が動いているのか、動いていないのか**を数える（★2026-09-19・WK-1/WK-2・読むだけ）。
   * 🔴 ★私は「7,333 → 7,332 の 1 頭減り」から「★ワーカーが動いている」と書きました。
   *   ✔ ★数えたら `world_state` は **0 行**（★ワーカーは一度も動いていない）で、
   *     ★減った原因は ★**私の検査が残したデータ**でした。★推測せずに数えるための道具です。
   */
  'diag-pool-drift.mjs',
  /** ★私が staging に残したものを数える（★2026-09-19・読むだけ・`cleanup-ds7-leak.mjs` の下見に対応） */
  'diag-my-leak.mjs',
  /** ★台帳に掃除しそこねた行が無いか（★2026-09-19・**SB-2**・読むだけ）。★孤児と `ref_id` の迷子も数える */
  'diag-ledger-orphans.mjs',
  /**
   * ★**PO-4 ① の後、出走プールが実際に広がったか**（★2026-09-19・読むだけ）。
   *   ★旧 `RACEABLE_WHERE` と新 `ACTIVE_WHERE` の頭数を並べ、★既定で読んだプールの世代構成を出す。
   * ⚠️ ★「V は動かない」とは書かない（A→D は 2.04σ）。★「入れた結果 D になった」まで。
   */
  'verify-po4-pool.mjs',
  /** ★確定したレースがいつ作られたか（★2026-09-19・SB-1 ③・読むだけ）。★ワーカー由来か検査由来かを分ける手がかり */
  'diag-settled-provenance.mjs',
  /**
   * ★**SY-3 / WK-4**（★2026-09-19・読むだけ）。
   *   ★確定の時刻が発走予定より**前**なら `verify-v11-synthetic` の印、★**後**ならワーカーの印。
   *   ★ワーカーが最後に何かした時刻も出す。
   */
  'diag-sy3-wk4.mjs',
  /**
   * ★**コミットの前に通す門**（★2026-09-19）。★`typecheck` と `verify:red` を 1 つのコマンドで走らせ、
   *   ★**自分の終了コードを中の判定そのものにする**。★DB には一切触れません。
   *
   * 🔴 ★**道具にした理由**: ★手順（`;` → `&&`）では 3 回止まりませんでした。
   *   ★`npm run verify:red | tail -8 && git commit` は ★**パイプの終了コードが `tail` のもの**（常に 0）なので、
   *   ★画面に「🔴 不合格」が出ているのにコミットが通りました（`5ddac8d`）。
   *   → ★**繋ぐのをやめて 1 つのコマンドにする**のが、接続詞を変えるより確実です。
   */
  'gate.mjs',
  // ★読むだけ。保存済みレースが番組表と一致し、馬場が good 固定でないかを見る
  'verify-conditions-db.mjs',
  // ★読むだけ。本番が作ったオッズと本番が出した着順で払戻率を測る
  'verify-v10-db.mjs',
  // ★読むだけ。道悪のレースで heavy_aptitude が着順に効いているかを見る
  'verify-heavy.mjs',
  // ★読むだけ。PP の発行と吸収を数える。本番の実データでないと意味がない
  'diag-v11.mjs',
  // ★DB に一切接続しない。受け渡しテキストから secrets.staging.env を作るだけ。
  //   ファイルは書くが DB の状態は変えないので、ガードの対象外。
  'import-staging-secrets.mjs',
  'a3-mscale.mjs',
  'a3-predict.mjs',
  'a3-seeds.mjs',
  'check-gate.mjs',
  'mc-sweep.mjs',
  'penalty-sweep.mjs',
  'preseed-distribution.mjs',
  'verify-ability.mjs',
  'verify-build.mjs',
  'verify-repo.mjs',
  'verify-views.mjs',
  'verify-world.mjs',
  // ★読むだけ。判定書の SHA が HEAD かを見る（R-23）
  'verify-acceptance-sha.mjs',
  // ★読むだけ（判定書の SHA を書き換えるが DB は変えない）
  'update-acceptance-sha.mjs',
  'deps-of.mjs',
  // ★走行 8 コマの生成を回す（Codex）。画像とプロンプトを書くだけで DB に触れません
  'gen-pose-set.mjs',
  // ★P4 のアセット系。**DB に一切接続しません**（画像を読み書きするだけ）
  //   分類の基準は「DB の状態を変えるか」なので、ファイルを書いても readonly です
  'bake-sprites.mjs',
  /**
   * ★レース映像の馬コマを事前に焼く（★毛色・接地影・基準点）。★画像を書くだけ・DB に触れない。
   *   ★出力は `apps/web/public/art/baked/` のみ。★原版（`/art/horse-jockey-*.png`）は読むだけ。
   *   ★解像度は `tools/audit-draw-scale.mjs` の実測から決めます（★オーナー決定 560px・2026-09-02）。
   */
  'bake-race-frames.mjs',
  // ★ダートの地面タイルを焼く（画像を書くだけ・DB に触れない）
  'bake-dirt-tile.mjs',
  // ★横からの画のダート版を焼く（芝の板は読むだけ）
  'bake-dirt-plates.mjs',
  // ★読むだけ。自分で画面を見るための静止画
  'shot.mjs',
  // ★読むだけ。画面上の速さの変化を測る
  'diag-speed.mjs',
  // ★読むだけ。馬群の広がりが画面に収まるかを測る
  // ★読むだけ。距離ロスが着順に与える影響の大きさを見積もる（D-065 手順1）
  'diag-lane-impact.mjs',
  'diag-pack.mjs',
  // ★読むだけ。走破タイムの差がどの要素から来るかを切り分ける
  'diag-finish-spread.mjs',
  // ★読むだけ。シートの本当のコマ位置を数える
  'measure-sheet-blobs.mjs',
  'codex-imagegen.mjs',
  'make-gif.mjs',
  // ★読むだけ。ギャロップが走りとして成立しているかを測る
  'measure-gallop.mjs',
  // ★scene.js をそのまま実行して PNG にするだけ。DB にも台帳にも触れません
  'shot-scene.mjs',
  'diag-screen-overtake.mjs',
  'diag-cuts.mjs',
  // ★読むだけ。w による距離ロスの大きさを見積もる（D-065 の手順①）
  'diag-lane-loss.mjs',
  // ★読むだけ。ゲージの向きを測る（D-072・前回は符号が逆だった）
  'diag-gauge.mjs',
  // ★生アートから カットごとの元スプライトを焼く（契約 §5）。DB にも台帳にも触れません
  'bake-sprite-sizes.mjs',
  // ★斜め俯瞰でレースを動画にする。★絵を動かして自分の目で見るため。DB に触れません
  'render-oblique-video.mjs',
  // ★参考映像を読んで測るだけ。DB に触れません
  'measure-ref2d.mjs',
  // ★コース幾何を読んで数えるだけ（Q-P4-46 手順①）。DB に触れません
  'count-headings.mjs',
  // ★8 コマのシートを切り出し、同時に胴体基準で揃える。画像を読み書きするだけ
  'slice-pose-sheet.mjs',
  // ★走行 8 コマを胴体基準で揃え直す。画像を読み書きするだけ
  'align-pose-set.mjs',
  // ★走行 8 コマ（個別ファイル）の受け入れ判定。画像を読んで測るだけ
  'verify-pose-set.mjs',
  // ★画像を読んで測るだけ（駆歩シートの受け入れ判定）。DB に触れません
  'verify-gallop-sheet.mjs',
  // ★画像を読んで整列し直すだけ。DB に触れません
  'align-gallop-sheet.mjs',
  // ★画像を読んで枠色8行に焼くだけ。DB に触れません
  'bake-oblique-sheet.mjs',
  // ★透視投影の静止画を描くだけ。DB に触れません
  'shot-perspective.mjs',
  // ★読むだけ。斜め俯瞰の試作を静止画で確かめる
  'shot-oblique.mjs',
  // ★読むだけ。3カットを本番のエンジンで描いて大きさを決める
  'shot-cuts.mjs',
  // ★画像を読み書きするだけ。DB に触れません
  'bake-oblique.mjs',
  // ★動画をコマに切って幾何と時間を測るだけ。DB に触れません
  'measure-race-video.mjs',
  'measure-race-still.mjs',
  'measure-silk-budget.mjs',
  'measure-sprite-sheet.mjs',
  'pick-silk-palette.mjs',
  'render-field.mjs',
  'render-race.mjs',
  'world-search.mjs',
  // ★画像・監査成果物だけを読み書きし、DB状態には触れない
  'assemble-directional-frames.mjs',
  'audit-race-broadcast.mjs',
  'audit-race-scenarios.mjs',
  'clean-sprite-sheet-components.mjs',
  // ★Broadcast V2のPNG・測定JSONだけを出力する。DBには接続しない
  'audit-broadcast-v2.mjs',
  // ★画像ファイルのクロマ除去・分割だけを行い、DB状態には触れない
  'remove-chroma-key.mjs',
  'split-horizontal-frames.mjs',
  // ★合格済み背景プレートをループ多層パララックス素材（PNG＋manifest）へ分解するだけ。DBには接続しない
  'split-parallax-layers.mjs',
  // ★読むだけ。Broadcast V2 の動き（背景の流速・馬の大きさ・見た目速度）を全編で数値化する
  'audit-race-motion.mjs',
  // ★画像ファイルを WebP に変換して隣に置くだけ。DBには接続しない
  'build-art-webp.mjs',
  /**
   * ★デフォルメ馬（★内部仮称「STARミニホース」）の Gate 0（★2026-09-03）。
   *   ★DB を一切見ない。★`@star/render` の純粋関数を読んで図形を描くだけ。
   *   ★出力は `out/deformed-gate0/`（動画）と `design/art/deformed/`（暫定契約 v0 の JSON）のみ。
   *   ⚠️ ★`emit-deformed-contract.mjs` はファイルを書くが、★出どころは
   *      `packages/render/src/deformed-horse-parts.ts` の 1 か所で、★生成物を落とすだけ。
   */
  'render-deformed-gate0.mjs',
  'emit-deformed-contract.mjs',
  /**
   * ★購入リグのテクスチャを `/rig-lab` 用に変換する（★2026-09-03）。
   *   ★DB を見ない。★読むのは購入素材の TGA、★書くのは `apps/web/public/rig-lab-assets/`
   *   （★`.gitignore` 済み・★本番では `/rig-lab` ごと 404）。
   */
  'build-rig-lab-textures.mjs',
  /** ★購入 FBX の中身（クリップ・メッシュ・材質）を読むだけ */
  'inspect-purchased-fbx.mjs',
  /**
   * ★購入クリップ 29.2 秒の棚卸し（★2026-09-03）。
   *   ★蹄の高さ・接地・腰の上下を測るだけ。★DB も製品コードも触りません。
   */
  'probe-rig-clip.mjs',
  /**
   * ★納品スプライトの検品・修復（★2026-09-05）。★DB を見ない。
   *   ★`repair-…` … 焼き込まれた市松模様を抜いて本物の透過へ
   *   ★`align-…`  … 5 層に同じ変換を掛けてコマ間の揺れを揃える
   */
  'repair-delivered-sprites.mjs',
  'align-delivered-sprites.mjs',
  'align-sprites-by-rigid.mjs',
  /**
   * ★24 パーツを STAR のリグで動かして走行コマを焼く（★2026-09-06）。
   *   ★DB を見ない。★読むのは納品パーツ、★書くのは tmp/ と rig-lab-assets（★.gitignore 済み）。
   */
  'bake-deformed-frames.mjs',
  /** ★緑の抜き残りを測るだけ（★2026-09-07）。★DB も書き込みも無し */
  'verify-chroma-residue.mjs',
  /** ★無彩色の馬を着せ替える（★2026-09-07）。★DB を見ない・書くのは out/ のみ */
  'dress-greyscale.mjs',
  /** ★着せ替えの下地が engine の条件を満たすか測るだけ（★2026-09-07） */
  'verify-dress-keys.mjs',
  /**
   * ★コマごとに形が変わる白い光沢を落ち着かせる（★2026-09-07）。★DB を見ない・画像を書くだけ。
   * ★オーナー評「帽子の点滅／馬の眉間から鼻の白いチラつき」への対処。
   */
  'calm-highlights.mjs',
  /**
   * ★個体タイプが「別の馬」に見えるかを測るだけ（★2026-09-08）。★DB も書き込みも無し。
   * ★合格線は発明せず、★**同じ馬の別コマ**の差を下限に使います。
   * ⚠️ ★輪郭だけの物差しです。★白い印と表情は測っていません。
   */
  'measure-look-distinctness.mjs',
  /**
   * ★デフォルメ馬を、本番が読む「原版」の形で `/art/` に写す（★2026-09-08）。
   *   ★DB を見ない。★書くのは `/art/horse-jockey-*-poseNN.png` だけ。
   * ⚠️ ★勝負服を ★**無彩色へ戻して**から写します。★本番は勝負服を彩度の低い画素から
   *    ★探すので、★青のままだと ★**12 頭とも同じ色**になります（★実測）。
   */
  'publish-deformed-art.mjs',
  // ★パドックの歩きのコマ（Codex 生成物）を緑抜き・位置合わせ・勝負服の無彩色化して /art/ に置く。画像を読み書きするだけで DB に触れない（2026-09-15）
  'publish-walk-frames.mjs',
  /**
   * ★馬の白目を暗くして、★画面の大きさで目が光らないようにする（★2026-09-12・オーナー指摘
   *   ★「前からカーブバージョンの馬の目が赤色になる現象があり、怒っているように見えています」）。
   *   ★DB を見ない。★書くのは `/art/horse-jockey-diag-front-v4-poseNN.png` だけ。
   * ⚠️ ★塗るのは ★**頭の中でいちばん大きい低彩度の塊 1 つ**だけ（★実測 242〜327 画素）。
   *    ★閾値を下げて全部拾うと面繋・鼻の照りまで塗り、★素材を壊します。
   * ⚠️ ★焼いたアトラス（`/art/baked/`）は ★**別に焼き直しが要ります**。
   */
  'soften-horse-eye.mjs',
  /**
   * ★毛色 7 色が見分けられるかを測るだけ（★2026-09-08）。★DB も書き込みも無し。
   * ⚠️ ★**馬体の画素だけ**で測ります。★画面全体の平均だと騎手・鞍・ゼッケンが混ざり、
   *    ★開発側は 1 度それで誤った数字を報告しました。
   */
  'measure-coat-spread.mjs',
  /**
   * ★毛色の変換値を探すだけ（★2026-09-08）。★DB も書き込みも無し（★数値を出力するだけ）。
   * ⚠️ ★手で 1 つずつ動かすと ★**押した所が別の所で戻ります**（★実測で 3 回）。
   *    ★全組の最小値が最大になる組を探させます。
   */
  'tune-coat-spread.mjs',
  /**
   * ★コーナーで馬の向きがどれだけ食い違うかを測るだけ（★2026-09-09）。
   * ★実測 6.0°。★「向きが追従しない」はコーナーの不自然さの主因ではありませんでした。
   */
  'measure-corner-facing.mjs',
  /**
   * ★馬群の縦の広がりを測るだけ（★2026-09-09）。
   * ⚠️ ★この値は Q-P4-38（漏洩対策）で設計された箇所です。★測るだけで、変えないこと。
   */
  'measure-pack-spread.mjs',
  /**
   * ★診断用のレース映像を撮るだけ（★2026-09-09）。★DB を見ない・画像を書くだけ。
   * ⚠️ ★**等速で撮ります**。★開発側は 1 度、倍率不明の映像をレビュー側に出しました。
   */
  'capture-race-diagnostic.mjs',
  /**
   * ★4 頭の検証台（`/rig-lab/sprite`）を等速で撮るだけ（★2026-09-10・★裁定 R4）。
   *   ★DB を見ない・画像と JSON を書くだけ。★台に注入した ★**撮影用の時計**へ
   *   ★進行距離を与えて 1 コマずつ出します（★運動式は変えていません）。
   */
  /**
   * ★直線の見え方を撮って要約するだけ（★2026-09-10・★別セッションが追加）。
   *   ★DB に触れず、★`out/contest-direct-review/` に画像と JSON を書くだけ。
   */
  'capture-contest-direct.mjs',
  'summarize-contest-direct.mjs',
  /**
   * ★カットごとの馬の大きさ（画面高比）を ★**画面が描いた矩形**から読むだけ（★2026-09-11・★オーナー ④）。
   *   ★DB に触れず、★`tmp/shot-horse-size/rows.json` を書くだけ。★レース状態も素材も変えません。
   */
  'measure-shot-horse-size.mjs',
  /**
   * ★素材を組み終えた時点の JS ヒープと画布の枚数を読むだけ（★2026-09-11・★台帳 A-11 / A-12）。
   *   ★DB に触れず、★出力は標準出力のみ。★レース状態も素材も変えません。
   */
  'measure-race-heap.mjs',
  /**
   * ★カットごとの「画面上の進行方向」と「隊列の形」を `__raceDiag` から読むだけ（★2026-09-11）。
   *   ★DB に触れず、★`tmp/screen-direction/rows.json` を書くだけ。★レース状態も素材も変えません。
   */
  'measure-screen-direction.mjs',
  'capture-bench-sprite.mjs',
  /**
   * ★撮った 2〜3 枚を ★**1 頭ぶん・同じ大きさ**に切り出して並べるだけ（★2026-09-10）。
   *   ★切り出し位置は各画面が自分で出した描画矩形から取ります（★R-30）。★読むだけ。
   */
  'compare-gait-crops.mjs',
  /** ★診断映像に走路の接線方向の矢印を重ねるだけ（★2026-09-09）。★本番の絵には影響しません */
  'render-corner-arrows.mjs',
  /** ★レース映像の見直し用（★レビュー側 codex が追加・★読むだけ） */
  'review-deformed-race.mjs',
  /**
   * ★前肢が地面を蹴っているかを測るだけ（★2026-09-07）。★DB も書き込みも無し。
   * ⚠️ ★この道具は ★**低い方の前蹄を 1 つだけ**追うため、★コマごとに別の脚を見ます。
   *    ★開発側はこれを同じ脚として読み、★誤った原因を報告して撤回しました。
   *    ★脚を 1 本ずつ追うには `measure-hoof-tracks.mjs` を使うこと。
   */
  'measure-foreleg-drive.mjs',
  /**
   * ★蹄の塊を 1 つずつ追う（★2026-09-07）。★DB も書き込みも無し。
   * ★実測では、★側面の絵は前肢 2 本が重なって分離できません（★8 コマ中 7 コマ）。
   * ★道具自身がそう出力するので、★その判定を無視して原因を書かないこと。
   */
  'measure-hoof-tracks.mjs',
  /**
   * ★生成コマを実機の素材まで仕上げる（★2026-09-07）。
   *   ★DB を見ない。★読むのは out/gen、★書くのは out/ と rig-lab-assets（★.gitignore 済み）。
   */
  'build-sprite-set.mjs',
];

/**
 * 状態を変える。★`assertNotProduction()` を必ず呼ぶこと。
 *   メタテストが、ここに載っているのに呼んでいないファイルを落とします。
 */
export const STATE_CHANGING = [
  /**
   * ★初期馬の絞り方を実測する（★2026-09-19・UI1-7・
   *   裁定 `REVIEW_UI1_SELECTION_RULE_VERDICT_20260919.md`）。
   *
   * 【★データは変えないのに、なぜここか】
   *   ★最後に `rollback` するので ★**1 ビットも残しません**。
   *   🔴 ★しかし `pick_initial_horse()` は `for update` で ★**数千行の錠を数分間掴ります**。
   *   ★本番でやると ★**ワーカーを待たせます**（★サイクルは 6 分）。
   *   → ★**「読むだけなら本番でもよい」は、錠を掴る読み方には当てはまりません。**
   *   ★`assertNotProduction` を呼んでいます（★この簿の条件）。
   */
  'verify-initial-horse-distribution.mjs',

  /**
   * ★過去の走りに `race_entries.prize_pp` を埋め戻す（★2026-09-19・PR-1 の後始末・T-11 の前提）。
   *   ★額は `prizeFor()` が決める（★賞金表を SQL に写さない・D-052）。
   *   ⚠️ ★既に入っている行は触らない／★`pp_ledger` には触らない
   *      （★過去に発行しなかった PP を、いま発行したことにはできない）。
   *   ★既定は**下見だけ**で、★`--write` を付けたときだけ書く。
   */
  'backfill-entry-prize.mjs',

  /**
   * ★**偽の DB が写している述語を、実 DB で確かめる 3 本**（★**FK-5**・2026-09-19）。
   *
   * 【★`rollback` するのに、なぜここか】
   *   ★`verify-initial-horse-distribution.mjs` と同じ理由です。
   *   ★取引の中では ★**本当に書きます**（`races` / `race_entries` / `horses.owner_id` /
   *   ★`auth.users`）し、★`for update` で錠も掴ります。
   *   🔴 ★**READONLY に置こうとしたら、簿の検定に止められました** — ★書き込み文があるので。
   *      ★**「rollback するから読むだけ」は、この簿の基準ではありません。** ★止められたのが正しい。
   *   ★3 本とも `assertNotProduction` を呼んでいます（★この簿の条件）。
   *
   * 【★なぜ要るか】★`CycleStore` の偽物は SQL を見ません（★層が上）。
   *   ★**本物の述語を手で写すしかなく、写し間違えたら黙って素通しします**
   *   （★2026-09-19 に `cancelRace` の `status = 'scheduled'` で実際に素通ししました）。
   *   → ★**写しのある検査には、実 DB の 1 本を対にします**（FK-5）。
   * ⚠️ ★**`tmp/` に置いていたものを移しました** — ★`tmp/` は gitignore なので、
   *    ★**対にしたつもりが、次のセッションには消えていました。**
   */
  'verify-d117-fill.mjs',
  'verify-ds7-cancel.mjs',
  'verify-registered-excludes-scratched.mjs',

  /**
   * ★**登録の後・発走の前に引退した馬は、取消になるか**（★**DS-5 ③**・**D-111 ③**・2026-09-19）。
   *
   * 🔴 ★これが見つけたもの: ★**`entry-freeze` は、登録された馬を一度も見ません。**
   *   ★組成の前 … `r.status` が `announced` ≠ `scheduled` → 外れる
   *   ★組成の後 … `e.entrant_snapshot` が非 null        → 外れる
   *   → ★★**掛かる瞬間が存在せず、★引退した馬がそのまま走っていました。**
   * ✅ ★直し（`scratchRetiredEntries`・組成の前）が通ることも、★同じ道具で見ます（⑧〜⑪）。
   * ⚠️ ★**取引の中で `horses` と `users` を書きます**（★引退・所有・返金）。★最後に rollback し、
   *    ★SB-3 が「途中の確定が無い」ことを見ます。★`assertNotProduction` を呼びます。
   */
  'verify-ds5-retire-scratch.mjs',

  /**
   * ★**組成 → 発走の間に引退した馬は、確定の前に取消になるか**（★**DS-5 ④**・D-111 ③⑥・2026-09-19）。
   *
   * 🔴 ★**主眼は「取消になる」ではなく、「広げすぎていない」ほう**です。
   *   ★確定は発走より後に走るので、★「いま引退しているか」で切ると
   *   ★**レースの最中／後に引退した馬まで取消**になり、★**走った馬の結果を消します**。
   *   → ★対照を 3 つ置きます: ★発走の後に引退／★確定済みのレース／★`epochMs` が無いとき。
   *
   * ✅ ★**SQL を写していません** — ★製品の `createPgStore().scratchRetiredBeforeStart` をそのまま呼びます。
   *   ⚠️ ★そのため ** `npx tsx` で呼ぶこと**（★TypeScript を読み込みます）。
   * ⚠️ ★**取引の中で `horses`・`race_entries`・`races` を書きます**。★最後に rollback し、
   *    ★SB-3 が「途中の確定が無い」ことを見ます。★`assertNotProduction` を呼びます。
   */
  'verify-ds5-before-start-scratch.mjs',

  /**
   * ★**「前に言ったときの能力」が、言った週にだけ動くか**（★**GB-1 ④⑤⑥**・移行 `0053`・2026-09-19）。
   *
   * 🔴 ★これが見るもの: ★`training-runner` の一括更新は `unnest($14::jsonb[], $15::bigint[])` で
   *   ★**配列の並びを 1 つ間違えると、★別の馬の基準を書きます**（★`fillRace` の `$1..$19` と同じ形の危うさ）。
   *   ★型の検査でも偽の DB でも出ません。→ ★**2 頭ぶんを一度に書いて、混ざらないこと**まで見ます。
   * ★GB-1 ⑤（★言わなかった週は 1 ビットも動かない）と、★その対照（★言った週は動く）も見ます。
   * ⚠️ ★取引の中で `horses` を書きます。★最後に rollback し、★SB-3 が途中の確定を見ます。
   *    ★`assertNotProduction` を呼びます。
   */
  'verify-gb1-growth-tell.mjs',

  /**
   * ★**私が staging に残した検査データを消す**（★2026-09-19・後始末）。
   * 🔴 ★`verify-ds7-cancel.mjs` が `rollback` したつもりで確定していた分
   *   （★レース 2 件・所有馬 2 頭・`public.users` 1 人・`ep_ledger` 1,000 EP）。
   * ★既定は下見だけ。★`--write` で消します。★`assertNotProduction` を呼びます。
   */
  'cleanup-ds7-leak.mjs',

  /**
   * ★**SB-3 の見張りが、本当に「途中の確定」を見つけるか**（★2026-09-19・対照つき）。
   * ⚠️ ★実データに触りません（★一時表だけ）。★それでも `create temporary table` は書き込み文なので、
   *    ★簿の基準どおりここに置きます（★`assertNotProduction` も呼びます）。
   * 🔴 ★**対照（②わざと commit して 🔴 を出させる）が本体**です — ★それが無いと、
   *    ★「いつでも ✅ を返す実装」と見分けが付きません。
   */
  'verify-sandbox-detects-commit.mjs',

  /**
   * ★**SY-1 の「自分のレースを写す」部分だけ**を確かめる（★2026-09-19・rollback ＋ txid の見張り付き）。
   * ⚠️ ★`verify-v11-synthetic.mjs` そのものは**わざと書く道具**なので流しません。
   *    ★足した写し／消しの SQL だけを、★同じ文で確かめます（★写し元に触らないことも見ます）。
   */
  'verify-sy1-clone.mjs',

  /**
   * ★**DL-1: 日次の 3 つの関数が動くかを、実 DB で通す**（★2026-09-19・rollback ＋ txid の見張り付き）。
   *   ★`aggregateDay` / `recordUnlockDistribution` / `recordStoryRows`。★どれも自分で取引を張りません。
   * ⚠️ ★**「落ちなかった」と「書いた」は別**なので、★行数を前後で数えます。
   */
  'diag-dl1-daily.mjs',

  /**
   * ★**DL-2 の記録が、本当に後から問える形になっているか**（★2026-09-19・rollback ＋ txid の見張り付き）。
   * 🔴 ★見るのは「通った」ではなく ★**①通った ②落ちた理由 ③0 行の成功が見分けられる**の 3 つ。
   *    ★③ が本体 — ★`point_flow_daily` が 0 行のまま 1 か月 気づかなかったのが、まさにそれ。
   * ⚠️ ★対照つき（★理由の無い失敗は CHECK で作れない／★記録が落ちても本体は止まらない）。
   */
  'verify-dl2-daily-log.mjs',

  // ★中で状態を変えるツールを流すので、これ自体も状態を変える
  'audit-tools.mjs',
  'fix-purse.mjs',
  // ★staging に発売中のレースを作る（検証ツールの前提を揃える）
  // ★同じレースを2通りの方法で投入して突き合わせる（後片付けあり）
  'diag-insert.mjs',
  'seed-races.mjs',
  // ★staging のレースを確定させる（時間を進める代わり）
  'settle-races.mjs',
  // ★週送りをワーカーの経路で実際に回す（全馬の状態を進める）
  'verify-training-week.mjs',
  // ★出走馬の凍結（0016）の検証。horses を一時的に壊してから確定するので状態を変える
  //   （壊した値は1頭ずつ元に戻し、戻せたことも検査する）
  'verify-entrant-freeze.mjs',
  // ★D-056 の検証。凍結を消してレースを中止させるので状態を変える（元に戻す）
  'verify-unfrozen-cancel.mjs',
  // ★開放率の日次記録（unlock_daily に書く）
  'verify-unlock-daily.mjs',
  // ★V-19 の DB 側（#5/#6/#10/#15）。auth ユーザーと identity 行を作って一意制約と RLS を叩く（後片付けあり）
  'verify-v19-db.mjs',
  // ★auth.identities に行ができるかの確認（D-113 ③・裁定 REVIEW_AUTH_EMAIL_PASSWORD_VERDICT_20260918 §2）。
  //   anon キーの signUp で利用者を 1 人作り、最後に消す（後片付けあり）
  'probe-auth-identities.mjs',
  // ★signUp が通るメールのドメインを 1 つ見つける。通ったドメインで利用者を 1 人作り、その場で消す
  //   （example.com と test.local が弾かれたため。1 つ通れば止める）
  'probe-signup-domain.mjs',
  // ★V-19 をメール＋パスワード経路の形で測る（D-113・経路ごとに課す・正典 §13.2）。
  //   対照用の利用者を 1 人作って消す。登録を伴う項目は --with-signup のときだけ
  'verify-v19-email.mjs',
  // ★調査で意図せず作った利用者を消す。--email か --created-after で対象を絞り、--yes が無ければ下見だけ
  //   （2026-09-18、429 の中身を見るつもりの呼び出しが 200 を返して利用者が 1 人できた）
  'cleanup-probe-user.mjs',
  // ★staging の馬を実際に育てる（誕生週をずらして週送りを回す）
  'age-horses.mjs',
  // ★合成集団で経済を一巡させる（V-11 の②）
  'verify-v11-synthetic.mjs',
  // ★実際に馬券を買って払戻の機械を検査する
  'verify-v10-bets.mjs',
  'seed-stables.mjs',
  'seed-world.mjs',
  'synthetic-bettor.mjs',
  'verify-a2.mjs',
  // ★B-1: 馬の育成状態を書き換え、horse_week_log を作る
  'verify-b1.mjs',
  // ★G-6: 検証用の口座と台帳を作り、馬の所有者を書き換える
  'verify-g6.mjs',
  'verify-a4.mjs',
  'verify-a5.mjs',
  'verify-a6.mjs',
  'verify-a7.mjs',
  'verify-cancel.mjs',
  'verify-db.mjs',
  'verify-economy.mjs',
  'verify-exchange.mjs',
  'verify-flow.mjs',
  'verify-overdue.mjs',
  'verify-prize.mjs',
];

/** 本番に向けることが目的のもの。★理由を必ず書く（空欄で登録できない） */
export const PRODUCTION_OPS = [
  {
    file: 'deploy.sh',
    why: '★VPS への配備そのもの（★正典 §14/§15・`/opt/star-current` のリンクを張り替える）。★本番に向けられなければ意味がない。⚠️ ★**Git の push では入れ替わりません** — ★このスクリプトを走らせない限り古いワーカーが動き続けます（★監査 `REPORT_AUDIT_20260914.md:142` と裁定 `REVIEW_AUTH_EMAIL_PASSWORD_VERDICT_20260918.md` §4 で 2 度誤報された篇所）',
  },
  {
    file: 'migrate.mjs',
    why: '★スキーマ移行そのもの。本番に適用できなければ意味がない。★機械的な検出では「読取専用」に見える（DDL は .sql 側にあり、ツール本体に SQL 文字列が無い）ので、ここに明示しないと静かに誤分類される',
  },
];

/**
 * ★**道具ではないもの**（★2026-09-19・**TG-2**・裁定 `REVIEW_UI1_SELECTION_RULE_VERDICT_20260919.md`）。
 *
 * 【★なぜ「対象外」も簿に書くのか】
 *   ★**「対象外」も分類の 1 つ**だからです。★簿に無いものを黙って見逃す形にすると、
 *   ★**新しいファイルが「たぶん対象外だろう」で素通り**します（★R-24 が防ぎたかった形）。
 *   → ★`tools/` 直下のファイルは ★**1 つ残らず**、READONLY / STATE_CHANGING /
 *     PRODUCTION_OPS / NOT_A_TOOL のどれかに、★**理由付きで**載ります。
 *
 * ⚠️ ★ここに載せてよいのは ★**実行されないもの**（データ・設定）だけです。
 *    ★実行されるなら、★**DB に触らなくても**上の 3 つのどれかです。
 */
/**
 * ★**部品**（★2026-09-19・**TG-3**・裁定 `REVIEW_UI1_VERDICT_20260919.md`）。
 *
 * 【★なぜディレクトリごと除外をやめたか】
 *   ★旧: `tools/` の ★**直下だけ**を見ていました。
 *   🔴 ★→ ★**「部品だからディレクトリに置く」ですり抜けられます。**
 *      ★**拡子で絞るのと同じ形**です（★今日その列挙をやめたばかりでした）。
 *   ★実際、旧版の註記は自分で「中身は対象外のまま ＝ **残っている穴**」と書いていました。
 *   → ★**`tools/` 配下を再帰で全部**対象にし、★**部品も理由付きで簿に載せます。**
 *
 * 【★ここに載せてよいもの】
 *   ★**他の道具から import されるだけで、単体では走らせないもの。**
 *   ⚠️ ★**単体で走らせるなら部品ではありません** — ★DB に触らなくても
 *      READONLY / STATE_CHANGING / PRODUCTION_OPS のどれかです。
 */
export const COMPONENT = [
  { file: 'lib/args.mjs', why: '★コマンドライン引数の解析。★2026-08-20 に本番へ余計な移行を当てた事故の後、切り出した部品' },
  { file: 'lib/cdp.mjs', why: '★Chrome DevTools Protocol の細口（★映像の撮影の道具が使う）。★単体では走らせない' },
  { file: 'lib/classification.mjs', why: '★この分類簿そのもの。★道具ではなく、道具を分類する表' },
  { file: 'lib/classification.d.mts', why: '★分類簿の型宣言（★`any` を使わないために置く）。★実行されない' },
  { file: 'lib/dress.mjs', why: '★勝負服の配色を描くための部品（★映像の道具が使う）' },
  { file: 'lib/env.mjs', why: '★接続先の選択を 1 か所にまとめた部品。★`--env` 必須の規則はここが持つ' },
  { file: 'lib/exposure-registry.mjs', why: '★公開の登録簿（★どの表・RPC を誰に開けるか）。★V-20 が読む表で、道具ではない' },
  { file: 'lib/provenance.mjs', why: '★生成物に「何から作ったか」を書き残す部品（★RD-4 ③・2026-09-19）。★道具が hash を埋め、★検査がいまのソースと突き合わせる。★道具ではない' },
  { file: 'lib/tool-aftermath.d.mts', why: '★`lib/tool-aftermath.mjs` の型（★TL-1・2026-09-19）。★`classification.d.mts` と同じ作法で、★道具ではなく部品。★中身（一覧）は `.mjs` が持つ（D-052）' },
  { file: 'lib/tool-aftermath.mjs', why: '★状態を変える道具の「後始末の作法」の簿（★TL-1・2026-09-19）。★`restores`／`consumes`／`pending` の 3 値で、★`tool-aftermath.test.ts` が全数分類を要求する。★道具ではない表' },
  { file: 'lib/open-findings.d.mts', why: '★`lib/open-findings.mjs` の型（★NT-3・2026-09-19）。★`classification.d.mts` / `guard.d.mts` と同じ作法で、★道具ではなく部品。★中身（一覧）は `.mjs` が持つ（D-052）' },
  { file: 'lib/open-findings.mjs', why: '★まだ直っていない指摘の登録簿（★**NT-3**・2026-09-19）。★`verify-open-findings.mjs` が読む表で、道具ではない。🔴 ★`REPORT_AUDIT_20260914.md` の 22 項目のうち 12 件が 5 日 そのままだったので、★**期限を持たせて門で落とす**形にした。★報告書は期限を持たない' },
  { file: 'lib/known-red.mjs', why: '★いま赤いと分かっている検査の登録簿（★RD-2・2026-09-19）。★verify-known-red.mjs が読む表で、道具ではない' },
  { file: 'lib/guard.mjs', why: '★`assertNotProduction` の本体。★状態を変える道具が呼ぶ部品' },
  { file: 'lib/sandbox-tx.mjs', why: '★**自分で `begin`/`commit` する関数を、外側の取引に閉じ込める包み**（★2026-09-19）。🔴 ★PostgreSQL に入れ子の取引は無いので、★内側の `commit` は**外側ごと確定**させる。★`verify-ds7-cancel.mjs` がそれで staging を汚した。★検査の道具で、★製品では使わない' },
  { file: 'lib/snapshot-file.d.mts', why: '★`lib/snapshot-file.mjs` の型（★**SB-6**・2026-09-19）。★`classification.d.mts` / `tool-aftermath.d.mts` と同じ作法で、★道具ではなく部品。★中身は写さず、★形だけ（D-052）' },
  { file: 'lib/snapshot-file.mjs', why: '★**元に戻すための控えを、★プロセスの外（`tmp/snapshots/`）に置く**（★**SB-6**・2026-09-19）。🔴 ★`verify-v11-synthetic.mjs` が `timeout` の SIGTERM で殺され、★控え（`STABLE_OF`）が**メモリごと消えて**、★**馬 9 頭の所属厩舎を永久に失った**（★`horses_owner_xor_npc` が `owner_id` を付けた時点で `npc_stable_id` を消すため）。⚠️ ★シグナルを捕まえるだけでは足りない — ★`SIGKILL`・電源断・OOM では走らない。★**書いて `fsync` してから `rename`**（★殺されても中身が届いている）。⚠️ ★**未検証**: ★本当に殺して確かめてはいない。★検査が見ているのは「別のプロセスから読めるか」まで。★検査の道具で、★製品では使わない' },
  { file: 'lib/tool-restores.d.mts', why: '★`lib/tool-restores.mjs` の型（★**SB-6**・2026-09-19）。★`snapshot-file.d.mts` と同じ作法で、★道具ではなく部品。★中身（表）は `.mjs` が持つ（D-052）' },
  { file: 'lib/tool-restores.mjs', why: '★**殺された道具が残した状態を、★次の実行が戻す**手続きの表（★**SB-6**・2026-09-19）。★`snapshot-file.mjs` は控えを置くところまでで、★戻す手は別に要る。🔴 ★道具の本体は先頭で DB に繋ぐので検査から `import` できない → ★**繋がない部品として外に出し、★偽の client で検査から実際に走らせる**。⚠️ ★**実 DB では確かめていない**（★確かめると `STABLE-1-SKEW` を測っている母集団を自分で動かす）。★`restore` は**冪等**であることを検査が要求する。★検査の道具で、★製品では使わない' },
  { file: 'lib/leftovers.mjs', why: '★**片付いたことを数える**部品（★**TL-1**・2026-09-19）。🔴 ★`delete` を呼んだは「消えた」ではない（★外部キー・権限・`where` の書き間違いで 0 行しか消えない）。★同じ形を 16 回 書くと 16 通りの微妙に違う形になり、★**何本かは数えたのに合否に入れ忘れます**（★`verify-v19-db` が実際にそうでした）。→ ★数え方と「0 でなければ落ちる」を 1 か所に。⚠️ ★`process.exit()` は呼ばず `process.exitCode` を立てるだけ（★呼ぶ側にまだ片付けが残ることがある）。★道具ではなく部品' },
  { file: 'lib/broad-deletes.d.mts', why: '★`lib/broad-deletes.mjs` の型（★`CLEANUP-NO-RECORD`・2026-09-19）。★`classification.d.mts` / `tool-aftermath.d.mts` と同じ作法で、★道具ではなく部品。★中身（一覧）は `.mjs` が持つ（D-052）' },
  { file: 'lib/broad-deletes.mjs', why: '★**自分が作った行以外を消す `delete` の登録簿**（★`CLEANUP-NO-RECORD`・2026-09-19）。🔴 ★**「危ないか」を機械に判定させない** — ★同じ日に検出の網を 3 回 書き直し（★精度 20%→探しているものを落とす→使える）、★**網のほうが壊れる**と分かった。→ ★機械は**形だけ**（★条件なし／範囲比較／`date =`）を拾い、★危ないかどうかは人がここに書く。★`known-red` / `open-findings` と同じ作法。★`broad-deletes.test.ts` が全数登録と件数のラチェットを要求する。★道具ではなく表' },
  { file: 'lib/counted-verdict.mjs', why: '★**「0 件 通過」を合格として返せない部品**（★**CK-14**・2026-09-20）。🔴 ★`CK-14` を作った本人が ★**10 分後に踏んだ**ので部品にした（★`verify-race-recompute` が、★全部を「版不明」に落として終了コード 0 を返した ＝ ★1 件も照合していないのに合格）。★★**通す／落とす の 2 つでは足りない** — ★3 つ目に ★**判定不能（終了コード 2）**を置く。⚠️ ★`2` を `0` に丸めないこと。★`counted-verdict.test.ts` が 3 つの返し分けを見る。★道具ではなく部品' },
  { file: 'lib/staleness.mjs', why: '★**「誰も見ていない期間」を作らない仕掛けの共通部品**（★**DP-1** / `O-2` / `O-4` / `O-6` / `F-3`・2026-09-20）。🔴 ★今日 見つけた 4 件は★**同じ 1 つの形**（★① 記録する ② 古びたら落ちる）で、★`O-6` で既に作っていた。→ ★**増やさず揃える**（★D-052）。★この部品が持つのは ★**古さだけ**で、★中身の妥当性は各道具の仕事。⚠️ ★`pending`（★まだ動かせない項目）には ★**期限が必須**で、★過ぎたら落ちる（★言い訳の置き場にしない）。★`staleness.test.ts` が ★**項目ごとに**見る（★1 件の失敗が 4 件の赤に見えないように）。★道具ではなく部品' },
  { file: 'lib/registries.mjs', why: '★**登録簿の登録簿**（★**CK-17**・2026-09-20）。★どの簿が「★何を走査して、★何と突き合わせるか」を持つ。🔴 ★2026-09-20、★`staleness` だけが両側とも持っていなかった。★レビュー側は「★新しい簿だから」と説明したが、★**実測すると外れる**（★同じ日に作った `printed-defaults` / `write-never` は最初から両側。★今日 作った 3 つのうち 2 つ）。✅ ★1 つだけ違ったのは ★**「外を走査する目」の有無**。→ ★★**走査の無い簿には、★「増えた／減った」を言う根拠が そもそも無い。**★`registries.test.ts` が、★新しい部品を ★「簿」か「簿でない」かに分けさせ、★簿なら `scans` と `compares` を書くまで通さない。⚠️ ★**中身の質は見ていない**（★決めたかどうかだけ）。★道具ではなく表' },
  { file: 'lib/write-never.mjs', why: '★**「読む側だけ在って、書く側が無い」列の登録簿**（★正典 **D-119** / **DB-1**・2026-09-20）。🔴 ★`broad-deletes` / `printed-defaults` と同じ作法 — ★形だけを機械が拾い、★当たりかどうかは人がここに書く。✔ ★精度を測った（★8 表）: ★**6 件中 5 件 ＝ 83%**。★`write-never.test.ts` が全数登録とラチェットを要求する。⚠️ ★**緑 ＝ 欠陥が無い、ではない。★緑 ＝ 登録簿と一致している**。★道具ではなく表' },
  { file: 'lib/printed-defaults.mjs', why: '★**旗で変えられる値を、定数のまま印刷していないか**の登録簿（★**CK-12**・2026-09-20）。🔴 ★`broad-deletes.mjs` と**同じ作法** — ★「嘘かどうか」を機械に判定させない。✔ ★精度を測った: ★網の 1 回目 **16 件中 3 件（19%）**、★3 手 入れて **7 件中 3 件（43%）**。★上げた手は「使い方の行を除く（★そこに既定値を書くのは正しい）／規則名（`R-30`）を除く／絶対値 2 以下を見ない」。→ ★機械は**形だけ**を拾い、★嘘かどうかは人がここに書く。★`printed-defaults.test.ts` が全数登録と件数のラチェットを要求する。⚠️ ★**②（桁を落とす嘘）は入っていません** — ★書けないと決めた（★理由はこのファイルの冒頭）。★道具ではなく表' },
  { file: 'lib/guard.d.mts', why: '★`assertNotProduction` の型宣言（★`any` を使わないために置く）。★実行されません' },
  { file: 'lib/pixel-font.mjs', why: '★画像に文字を焼くための点字の表（★映像の道具が使う）' },
  { file: 'lib/race-audit-build.mjs', why: '★映像の監査で使うレースの組み立て。★道具から呼ばれる部品' },
  { file: 'lib/race-audit-build.d.mts', why: '★`race-audit-build.mjs` の型宣言（★`any` を使わないため）。★実行されません' },
  { file: 'lib/v18.mjs', why: '★V-18（内外差）の判定で使う幾何の部品。★道具から呼ばれる' },
  {
    file: 'inventory/probe-setup.ts',
    why: '★テスト棚卸しの vitest セットアップ（N-2 / R-10）。★`vitest.probe.config.ts` が読み込む部品で、単体では走らせない',
  },
  {
    file: 'inventory/vitest.probe.config.ts',
    why: '★その vitest の設定。★`measure.mjs` が vitest に渡す。★設定であって道具ではない',
  },
];

/**
 * ★**ソースを書き換える道具**（★2026-09-19・**TG-4**・裁定 `REVIEW_UI1_SETUP_VERDICT_20260919.md`）。
 *
 * 【★なぜ READONLY から割ったか】
 *   ★この簿の「読取専用」は ★**「DB を変えない」**の意で、★裏取りも
 *   ★**SQL の書き込み文が無いこと**しか見ていません。
 *   🔴 ★下の 3 本は ★**DB に触れませんが、本番ソースを一時的に書き換えます**
 *      （★挿して測って戻す／壊して落ちるか見て戻す）。
 *   → ★**「読むだけ」と名乗らせるのは正確ではありません。**
 *     ★**「だいたい読取専用」を 1 つ許すと、次に同じ理由で 2 つ目が入ります。**
 *
 * 【★いまはここまで】
 *   ⚠️ ★**「必ず戻す」ことを検査で固定してはいません**（★裁定: それは別問題。
 *      ★いまは分類を正確にするだけでよい）。
 *   ★戻し漏れは ★**`git status` が汚れる**形で出ます（★道具自身も挿入・撤去の変化を assert します）。
 */
export const SOURCE_MUTATING = [
  {
    file: 'inventory/measure.mjs',
    why: '★テスト棚卸しの実行時計測（N-2 / R-10）。★DB には触れないが、★**本番エントリ 5 点にプローブを 1 行挿して全テストを回し、撤去する**。★挿入・撤去とも「実際に文字列が変化したか」を assert する（M-1 の空振り事故対策）',
  },
  {
    file: 'mutation/run.mjs',
    why: '★変異試験ハーネス（O-4 / R-11）。★DB には触れないが、★**ソースを壊して「テストが落ちるか」を見て戻す**のが目的の道具。★壊れたまま残ると、以後の検査がすべて信用できなくなる',
  },
  {
    file: 'mutation/gates.mjs',
    why: '★較正定数を壊して V-ゲートが落ちるかを実測する（Q-P3-42）。★同上（★ソースを一時的に壊して戻す）。★「登録簿とコメントは守っているつもりの記録で、守れているかは壊してみないと分からない」',
  },
];

export const NOT_A_TOOL = [
  {
    file: 'race-reference-shots.json',
    why: '★参考映像の切り出し位置のデータ（★映像の便）。★実行されません。★読むのは `tools/_*.mjs` の側で、そちらが分類の対象です',
  },
  {
    file: 'star-worker.service',
    why: '★VPS の systemd のユニット定義（★正典 §14/§15 の `star-worker`）。★実行されるのは VPS 上の systemd で、★ここから走らせるものではありません。★配備は `deploy.sh` が行います',
  },
];

/**
 * ★**全分類を平らにする**（メタテスト用）。
 * ⚠️ ★`NOT_A_TOOL` も含めます — ★**「載っているか」の判定に使うため**です
 *    （★`STATE_CHANGING` の見張りや `READONLY` の裏取りには使いません。★あちらは実行されるものだけが対象）。
 */
export function allClassified() {
  return [
    ...READONLY,
    ...STATE_CHANGING,
    ...PRODUCTION_OPS.map((x) => x.file),
    ...NOT_A_TOOL.map((x) => x.file),
    ...COMPONENT.map((x) => x.file),
    ...SOURCE_MUTATING.map((x) => x.file),
  ];
}
