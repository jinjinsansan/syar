# 【STAR】裁定 — `readClient()` は「セッションを持たない」と書かれているが、実際は持っている（2026-10-01・レビュー側）

- 発端: 開発側 `star-2b` の `e3e5014`（Supabase の器をブラウザで 1 つに）の照合中に見つけた
- 区分: すべて [CODE]

---

## §0 結論

- ✔ `e3e5014` の ①（テレビの馬をホームと同じ立ち姿に）②（スマホのホームの舞台の高さ）③（器を 1 つに）は了承する
- 🔴 ★**元からあった誤り**: `apps/web/src/lib/supabase.ts` の註記は「`readClient()` は**セッションを持たない**」と言うが、★`makeReadClient = (url, key) => createClient(url, key)` は**既定値**で作っている。★supabase-js 2.112.2 の既定値は ★`persistSession: true`・`autoRefreshToken: true`（`node_modules/@supabase/supabase-js/dist/index.cjs:33-34`）
  - ★だから `readClient` は ★**ログインの保存領域からセッションを拾い、トークンの更新の時計も持つ**。★`authClient` と同じ保存領域を、★2 つの器が見張って、★両方がトークンを更新しにいく
  - ★「註記が実装の代わりをしている」形（§15-8 の作法）。★註記が言う設計（読み取りはログインの有無で結果が変わらない）は、★**実装では守られていなかった**
- ★305 個の警告は、これが**呼ぶたびに 1 つずつ増えていた**もの。★`e3e5014` で 1 つにしたので数は止まったが、★**2 つの器が同じセッションを更新しあう形は残っている**

---

## §1 何が困るか

1. ★**トークンの更新がぶつかりうる**: 2 つの器がそれぞれ時計を持ち、同じリフレッシュトークンで更新を試みる。★更新の衝突は「突然ログアウトされた」に見える。★これまで 305 個で起きていたなら、オーナーの PC で「ログインが切れる」が出ていてもおかしくない（★未確認。[EYES]）
2. ★**読み取りがログインの有無で変わりうる**: 註記が避けたかった形。★いまは `is_mine` を読む 3 か所（`bet-screen.ts:153`・`race-real.ts:190`・`channel-feed.ts:122`）が**どれも `authClient` を通している**ので、★嘘の「あなたの馬」は出ていない。★ただし帯の網（`race-strip-notice`）が前提にする「`readClient` は誰の馬かを知らない」は、★**構造としては成り立っていなかった**（★選ぶ列で守られていただけ）

---

## §2 指示

1. ★`makeReadClient` に ★`auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false }` を渡し、★**註記どおりの器にする**
2. 🔴 ★**その前に**、`readClient` で読んでいる表とビューを全部挙げ、★**ログインしていないと読めないもの（RLS で `auth.uid()` を見るもの）が混ざっていないか**を確かめる。★混ざっていたら、それは ★**偶然セッションが紛れて動いていた**読み取りなので、★`authClient` に移してから 1. をする（★1. だけをすると、その画面が黙って空になる）
3. ★網: `auth-wiring` に「`makeReadClient` が `persistSession: false` と `autoRefreshToken: false` を渡す」を足す。★**対照**: 既定値に戻すと落ちること
4. ★ブラウザで、ログインした状態の console に `Multiple GoTrueClient instances` が**出ない**ことを確かめる（★器のうちセッションを見張るのが 1 つだけになるので、警告は消えるはず。★消えなければ私の読みが違う）
5. 簿に起票する。★閉じる条件は「`readClient` がセッションを持たず、ログインした状態で警告が 0 件」（★目的で書く）

★優先: ★「中継を出せませんでした」の原因調べと**同じ便でよい**（★どちらもオーナーの PC の console に出ている話）

---

## §3 追記（同日）— 本番の console に 1 件残った

- `87694cf` を本番に入れた後、オーナーの PC（ログイン済み）で ★`GoTrueClient@sb-hfvvxwoulrjqznperici-auth-token:1 … Multiple GoTrueClient instances detected … under the same storage key` が ★**1 件だけ**（修正前は `:303〜:305`）
- ★私の §2-4 の読み「警告は消えるはず」は ★**外れた**。★supabase-js は `persistSession: false` でも ★**storageKey が同じ**なら警告を出す。★増殖は止まっている
- ★裁定: ★**閉じる線（警告 0 件）は動かさない**。★`makeReadClient` に ★**別の `storageKey`**（例 `sb-<ref>-read`）を渡し、★2 つの器が名前の上でも別物になる形にする。★安く、警告の言う「同じキーでの同時使用」を構造で無くせる
- ★網: `auth-wiring` に「`makeReadClient` の `storageKey` が `authClient` の既定のキーと違う」を足す（★対照: 外すと落ちる）
- ★本番に入れた後、もう一度ログイン状態の console で 0 件を確かめてから簿を閉じる
