-- ★出走馬の状態を「オッズを計算したときのまま」凍結する（レビュー側裁定 2026-08-12）
--
-- 【何を直すか】
--   現在:  生成 → horses を読む（オッズ計算）
--          確定 → horses を**もう一度**読む（着順計算）
--          ★2回読むので、その間に馬の状態が動けば食い違う。
--
--   是正:  生成 → 使った状態をここに**凍結して保存**
--          確定 → ★凍結された状態を使う（読むのは1回だけ）
--
-- 【なぜ監視では足りないか】
--   `diag-b6` の per-horse 照合を定期的に流す案でしたが、それは**監視**です。
--   ★食い違いは**誰も何も変えなくても**起きます（データの状態が勝手に動くため）。
--   実際この便だけで2回崩れました:
--     ・`PLACEHOLDER_UNLOCK` により能力比 2.2754倍
--     ・`loadTrainingStates` が週送り未通過の馬を返さず、224頭全部で調子がずれた
--   ★どちらもコード変更ではありません。R-23（コードが変われば失効する）では捕まりません。
--   → 凍結すれば**食い違いが原理的に起きなくなり、検出も監視も要らなくなります**。
--
-- 【副産物: §8.6 のリプレイ検証が完全になる】
--   「そのレースが何を入力に計算されたか」が DB に残るので、第三者が完全に再現できます。
--   現在は「そのとき horses がどうだったか」が失われます（D-052 と同じ問題の再発）。
--
-- ⚠️ 調子・疲労だけでは足りません。確定側は `horses` と結合して
--    **能力・適性・スキル遺伝子まで全部**読み直しています。凍結するのは
--    `RaceEntrant` 一式です（stats / surfaceAptitude / distanceCenter / distanceRange /
--    strategyAptitude / heavyAptitude / condition / fatigue / weightKg / gate / age / skillGenes）。

alter table race_entries
  add column if not exists entrant_snapshot jsonb;

-- ★`comment on ... is` は式を取りません（`||` は構文エラー）。文字列リテラル1つで書きます
comment on column race_entries.entrant_snapshot is
  '★オッズ計算に使った RaceEntrant そのもの。確定はこれを使う（horses を読み直さない）。null は 0016 より前に作られたレースのみ。新規レースで null なら生成側の不具合。';
