# 本番を仕上げる手順（1 枚）

> 2026-09-20・開発側。**まだ 1 つも実行していません。**
> 🔴 **オーナーの直接の指示が来るまで、②以降に進みません。**

## 0. いまの本番（実測・2026-09-20）

| | 版 | 実測 |
|---|---|---|
| **画面**（Vercel） | **2026-09-18**（`02fda8a`・`main`） | `/api/healthz` ✅・3 ページ **HTTP 200**・環境変数 **あり** |
| **DB / ワーカー**（VPS） | **2026-08-20** | 移行 **20/53 適用・33 件 未適用** |

- 馬 **7,355 頭**・`birth_week` 持ち **0 頭**・`horse_week_log` **0 行**・引退 **0 頭**
- レースは **6,066 本** 走っている（★2026-08-20 のエンジンで）

## 🔴 先に要る許可（★3 つ・★いずれも戻せません）

| # | 操作 | 戻せるか |
|---|---|---|
| **A** | 移行 **33 件**を本番に当てる | ❌ 移行に下りは書かれていない |
| **B** | `seed-world.mjs` を本番に流す（**`delete from horses` から始まる**） | ❌ 前の世界は戻らない |
| **C** | ワーカーを配備する（`tools/deploy.sh`） | ⚠️ 旧リンクに戻せば戻る |

⚠️ **B は本番の 7,355 頭と 6,066 レースの履歴を消します。**
消える前に何か残すなら、**この手順に入る前**に決めてください。

---

## 手順

### ① 往復を測る ✅ **済**

```
production 中央 48〜51 ms ／ staging 219 ms（read-only・select 1）
→ 追いつきの往復は約 266 回 ＝ ★本番で約 13 秒（＋ CPU 2 秒）
```

⚠️ **この数字は一度 間違えました**（3.3 時間と報告 → 往復の回数を数え直して 13 秒）。
**`update` は `unnest` で 1 文 2,000 頭**なので、1 頭 1 往復ではありません。

### ② 移行 33 件を当てる 🔴 **許可 A**

```bash
npx tsx tools/migrate.mjs --env production      # ★先に下見の出力を読む
```
- ⚠️ `migrate.mjs` は**適用済みファイルの書き換えを拒みます**（正しい挙動）
- ⚠️ **`races.course_frozen` が入ります** — D-065 の 2 次元走路。ここから距離ロスが効き始めます

### ③ O-7 を再確認（**読むだけ**）

```bash
npx tsx tools/verify-anon-exposure.mjs --env production
```
- 🔴 **いま不合格**: `exchange_prize` / `place_bet` / `spend_training_ep` に **anon の EXECUTE**
- ②で直る**見込み**。**「当てたから直ったはず」で閉じない**
- ✅ 合格するまで **④に進まない**（弁護士に見せる前提・§17 O-7）

### ④ 世界を作り直す 🔴 **許可 B**

```bash
npx tsx tools/seed-world.mjs --env production   # ★約 1 分 の見込み（未実測）
```
- 案 **A（転記）＋ B-3（52 週へ層化）＋ C（`advanceTrainingWeeks` で追いつき）**
- 🔴 **並行で流さないこと** — 選ぶ問い合わせに `for update` が無く、
  同時に呼ぶと全員が同じ 2,000 頭を選んで **週が二重に進みます**
- 道具が自分で 3 つ確かめます: ①`birth_week` 無しが 0 頭 ②現役の頭数が一致 ③`birth_week` が 100 種類以上

**⑤ 作り直しの実測（読むだけ）**

```sql
select count(*) filter (where retired_at_week is null)            as 現役,
       count(distinct birth_week) filter (where retired_at_week is null) as 週の種類,
       count(*) filter (where birth_week is null)                 as 週なし
  from horses;
```
- 期待: **現役 2,400 / 週の種類 156 / 週なし 0**
- → これが出たら **`POOL-CLIFF` を閉じられます**

### ⑥ ワーカーを配備 🔴 **許可 C**

```bash
tools/deploy.sh          # ★/opt/star-current のリンクを張り替える
```
- ⚠️ **git push では入れ替わりません**（正典 §14/§15）
- ⚠️ **オーナーの実行が要ります**（このセッションから VPS に入りません）

### ⑦ 1 周 回ることを確かめる

- `[worker] 週送り 週=… 延べ…頭` が出るか（★出なければ ④が効いていない）
- 🔴 **`[worker] 週送りに失敗:` が出ないこと** — 出たら `PROD-NEVER-AGED` の fail-closed が鳴っています

### ⑧ 版を記録する

```bash
npx tsx tools/verify-deployed-build.mjs --base https://star-two-chi.vercel.app --record
```
- **7 日を過ぎると検定が落ちます**（`DP-1` / O-6）。落ちたらまたこれを流してください

---

## 🔴 ④の後に必ず起きること（★先に言っておきます）

- **`STABLE-1-SKEW` の 66 頭は消えます。** 跡は `evidence/20260919-stable1-skew/` に残ります
- **本番の 6,066 レースの履歴も消えます**（`delete from horses` の波及・外部キー）
- **較正の取り直しが要ります**（`AL-11`）。いまの帯は 2026-08-20 のエンジンの数字です

## まだ無いもの

🔴 **定常運転の供給**（`POOL-SUPPLY`）。製品コードの `insert into horses` は **0 件**。
作り直した世界も **260 週 後から毎週 15〜16 頭ずつ減ります**。**人を迎える前に要ります。**
