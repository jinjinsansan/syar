# 照会: 導入の永続状態（初回の馬づくりを途中から再開できるようにする）— 2026-09-22

- 開発側 Claude（`star-aa`）・照合 HEAD `3a37acb`
- 指示書 `CLAUDE_CODE_INSTRUCTIONS_FIRST_HORSE_20260922.md` §3（ログイン直後・再読み込み・別タブ・通信断で正しい段階から再開・既存利用者を自動で初回配合へ戻さない）
- PROPOSAL §4-5（`profile_created / parents_chosen / foal_created / named / ready`）・D-120 ④（途中離脱しても初回の権利は失効しない）
- 凡例: ✔ ＝ コード・DB で確かめた

## 1. 事実

| | |
|---|---|
| 口座の作成 | ✔ `create_account()`（`0037`）が `users` 行・初期 EP・**付与馬 1 頭**を 1 取引で作る（案 A の「付与 1 頭」はこれのまま） |
| 初回の配合 | ✔ `foal_requests`（`kind = 'breed_initial'`・利用者ごとに失敗以外 1 件）→ ✔ `foal_drafts`（命名前の仔） |
| 命名 | ✔ `foal_requests`（`kind = 'name'`）→ ✔ `foal_drafts.named_horse_id` と `horses` |
| `users` の列 | ✔ `id, display_name, stable_name, entry_points, prize_points, created_at, account_type, silk_color, silk_sleeve`。★**導入の段階を表す列は無い** |
| 画面の分かれ目 | ✔ いまは「`users` 行が在るか」だけ（`login` → 無ければ `/setup`・在れば `/home`・`stable-repo.ts` の `SetupRequiredError`） |

## 2. 案: 段階は ★**表を足さず、在る行から導く**（推奨）

段階は、既に在る行から一意に決まる。★新しい列に書き写すと、★**書き写しと実物が食い違う形**（D-119 の族）ができる。

| 段階 | 導き方（★この順に判定） | 画面 |
|---|---|---|
| `no_account` | `users` 行が無い | 表示名・厩舎名（`/setup`・いまのまま） |
| `legacy` | ★`users` 行はあるが、★この機能より前に作られた口座（§3） | ★初回の配合に**戻さない**。`/home` |
| `choose_parents` | 初回の要求が無い（★または `failed` だけ） | 父母の選択 |
| `waiting_birth` | 初回の要求が `pending` | 誕生待ち（★最大 60 秒・再読み込みでもここに戻る） |
| `naming` | 初回の要求が `done`・★その下書きが命名前（`named_horse_id is null`）。★命名の要求が `pending` なら「確かめ中」、★最後が `failed` なら理由を出して入力し直し | 命名 |
| `ready` | 下書きが命名済み | 最初の育成（★レース小窓はここから） |

- ★読む口は 1 つ: RPC `my_onboarding_state()`（★読み取り専用・本人の行だけ・段階と、画面に要る最小の値〔要求の状態・失敗の理由・下書きの id・性別・父母の名前〕を返す）。★非公開の能力値は返さない
- ★画面（`login`・`home`・`useStableView`）は ★この 1 つの結果で行き先を決める（★`users` 行の有無だけで「設定完了」とみなさない・PROPOSAL §4-5）
- ★別タブ・再読み込み・通信断: ★状態は DB にしか無いので、★どのタブも同じ段階を読む。★要求の再送は既に冪等（要求 ID・部分一意）

## 3. 決めてほしいこと

1. **既存利用者（`legacy`）の見分け方**。案:
   - (a) ★**移行で `users.onboarding_flow text` を足し、既存の行は `'legacy'`、新しい行は `'first_horse_v1'`**（★`create_account` が書く）。★一度だけ書き、以後は変えない（★段階そのものではなく「どの導入で始まったか」の印）
   - (b) `users.created_at` と機能の公開日時で分ける（★日時を 1 つ決めて書き留める必要があり、★staging と本番で違う）
   - ★開発側の推奨: **(a)**。★(b) は「日時の写し」を作る（D-053 の族）
2. **段階を導く場所**: ★RPC（SQL）で導く案。★判定は行の有無と状態だけで、★遺伝の計算は無いので SQL に置いても D-052 に反しない、と読んでよいか
3. **`legacy` の利用者が、後から初回の配合を使えるか**。★案: **使えない**（★既存利用者は既に付与馬を持っており、★D-120 の「初回 1 回」は新しい入口の話）。★通常の配合（I-1 以降）で繁殖に入れる
4. **初回の配合を飛ばして先に進めるか**（★「あとで」ボタン）。★案: **進めない**（★付与馬ですぐ遊べるので、★導入の途中でも `/home` へは行ける。★段階は `choose_parents` のまま残り、★戻ってくれば続きから）
