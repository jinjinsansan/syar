-- ★走路の形を「レースを生成したときの値」で凍結する（指示書 DEV_INSTRUCTIONS_VENUE_WIRING_20260915 §5-2）
--
-- 【何を直すか】
--   現在:  生成 → オッズのモンテカルロは `DEFAULT_OVAL`（1400m 以下の 20% は直線）
--          確定 → `courseShape: 'oval'` を直書き・走路の形は渡さない
--          ★該当するレースは「オッズを付けた模型」と「着順を決めた模型」が違う。
--          ★しかも走路の形は DB に残らないので、どちらで計算したかを後から特定できない。
--
--   是正:  生成 → 走路の形のオブジェクトを 1 回だけ作り、それでオッズを計算し、同じものをここに保存
--          確定・再計算・測定器 → ★ここを読む（`@star/race-engine` の `conditionsFromFrozen`）
--
-- 【★id で引かない理由】
--   `course_id` から `venues.ts` の現在の値を引く形だと、あとで半径や勾配（D-092）を変えたとき
--   ★過去のレースを再計算した結果が変わる（§8.6・D-055 の出走馬の凍結と同じ理屈）。
--
-- 【中身】{ v: 1, venueId, lapM, homeStretchM, widthM, cornerRadiiM?, turn, courseShape }
--
-- ★既存の行は null のまま（書き換えない）。null の行は DEFAULT_OVAL・'oval' で確定し、件数を警報に出す。
-- ★races_public は変えない（この便では画面に出さない）。

begin;

alter table races
  add column if not exists course_frozen jsonb;

-- ★`comment on ... is` は式を取りません（`||` は構文エラー）。文字列リテラル1つで書きます
comment on column races.course_frozen is
  '★生成時に凍結した走路の形 {v,venueId,lapM,homeStretchM,widthM,cornerRadiiM?,turn,courseShape}。オッズ・確定・再計算はこれを読む（course_id から現在の値を引かない）。null は 0023 より前に作られたレースのみ。';

commit;
