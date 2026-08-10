-- 0012: 誕生時の表現型を残す（P3 B-1 / §7.5 の恒久ダメージ・D-045）
--
-- 【なぜ要るか】
--   ★B-1 を2回流したら、2回目が**1回目の終了状態から始まりました**（気性 33 → 0 のまま、
--     素質も故障で削られたまま）。`horses.potential` / `stats` / `temper` / `durability` は
--     一生のあいだ書き換わるので、**「生まれたときどうだったか」がどこにも残りません。**
--
--   これは検証ツールの都合だけの話ではありません。§7.5 の恒久ダメージは
--   potential を永久に削り、D-045 は「**何が永久に失われたかを明示する**」ことを求めます。
--   1回ぶんの内訳（`InjuryResult.permanentLoss`）は返していますが、
--   **一生ぶんの累計**は、誕生時の値が無ければ出せません。
--
-- ★これは「生まれたときの写し」であって、新しいゲーム上の量ではありません。
--   仕様を足していないことの確認として、書き込みは誕生時の1回だけにします。
begin;

alter table horses add column if not exists birth_snapshot jsonb;

comment on column horses.birth_snapshot is
  '★誕生時の表現型（potential/stats/durability/temper）の写し。§7.5 の恒久ダメージで potential は一生のあいだ減り続けるため、誕生時の値が無いと「一生で何を失ったか」を出せない（D-045）。★誕生時に1回だけ書く';

commit;
