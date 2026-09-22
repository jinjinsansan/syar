# 引継ぎ書 — 本番 UI・認証・初回設定（2026-09-22）

> Claude Code / Codex 共通。次のセッションでは **最初に `CLAUDE.md` を読む**。このリポジトリに `AGENTS.md` はない。ユーザーは「原則として子エージェントを使わず、メインの Codex 単体で調査・実装・検証」を希望している。
>
> この文書は 2026-09-22 のセッション終了時点の記録。前日の `HANDOFF_UI_POLISH_20260921.md` は背景・禁止事項・未解決課題の詳細として有用だが、そこにある HEAD、本番 URL、認証・UI の状態は更新されている。現在値は再測定すること。

## 1. 最初にすること

1. `CLAUDE.md` とこの文書を読む。仕様判断が必要なら `STAR_SPEC_v2.0.md` を読む。`git.txt` は認証情報を含むため読まない。
2. `git status --short --branch`、`git log -8 --oneline`、`git rev-parse origin/main` を実行し、共有作業ツリーの状態を確認する。
3. `https://www.umamonogatari.com/api/healthz` の `sha` と `origin/main` を比較する。これは **Web の版だけ**を示し、VPS ワーカーの版ではない。
4. オーナーが同じブラウザ・同じホスト名で `/setup` を最後まで通せたか確認する。実登録が未確認のため、まずここが最優先。
5. 不具合があれば実画面とブラウザのネットワークエラーを確認し、Auth、`public.users`、`create_account` RPC、`my_horses` を切り分ける。DB を書き換えて辻褄を合わせない。

## 2. セッション終了時の状態

| 項目 | 確認した値 |
|---|---|
| 作業ディレクトリ | `V:\dev\Cusor\star`（Windows / PowerShell） |
| 作業ブランチ | `p4/race-30sec-cuts`。`origin/p4/race-30sec-cuts` より 7 コミット先行している。Web の本番配信元は `main` |
| 最終 UI 実装コミット | `3544234`（本セッションで `git push origin HEAD:refs/heads/main` 済み）。この引継ぎ書の記録コミットはその次に来るため、再開時は `git log` で測る |
| 本番 Web | `https://www.umamonogatari.com/api/healthz` が `sha=3544234be56bb8058bf8efdb94da3791e3a9bbf8`、`ref=main`、`env=production` を返した（2026-09-22 00:59 UTC） |
| 本番 DB | このセッションでは読み取り専用の確認のみ。書き込み・移行なし |
| VPS ワーカー | このセッションでは触っていない。前日引継ぎ書の版は `24af9f2`。次回は必要なら再測定 |
| 門 | `npm.cmd run gate` が全 5 段合格。テスト 2,751 件中、既知の赤 2 件は登録簿と一致 |

### 共有ツリーの注意

セッション終了時、追跡済みの画像 `apps/web/public/art/uma/title-eye.png` と `.webp` が作業ツリー上で削除状態。多数の `apps/web/public/art/**` 未追跡画像、`design/art/prompts/deformed-8frames-high-diag.txt`、`evidence/world-build/*.json` もある。**今回の Codex はこれらを変更・ステージしていない。** 所有者や用途が不明なため、勝手に削除、復元、追加しない。`git stash`、`git add -A`、`git commit -a` を使わず、対象ファイルを明示する。

## 3. オーナーが望んでいる体験

- 本番サイトの全 UI を、お客に見せられる品質まで仕上げること。
- レースが数分おきに開催され、全ページでレース演出を常に見られる設計。実レースの常時表示は今すぐ完成できなくても、**演出デモでも本番らしい導線と動き**を求めている。
- ログイン不要でも中継・演出デモを見られること。前日に `/race` のゲスト用デモ導線を実装した（`7b9afb6`）。
- 登録、ログイン、パスワード再設定、初回設定、持ち馬表示が自然に繋がり、PC とスマートフォンで崩れないこと。

レース常設表示の詳細は前日の引継ぎ書、`REPORT_RACE_NOTICE_FEASIBILITY_20260921.md`、既存のデザイン資料を参照。オーナーが言及した `RACE_NOTICE_HANDOFF.md` と `.dc.html` は、このセッションの `rg --files` ではリポジトリ内に見つからなかった。必要なら ZIP の現物を確認すること。存在を仮定して実装しない。

## 4. 2026-09-22 に反映した Web 修正

| コミット | 内容 |
|---|---|
| `2196cb4` | 登録・ログイン画面の見た目を直し、パスワード再設定の経路を追加 |
| `43a7412` | 登録画面から「パスワードを忘れた方」への導線を追加 |
| `83c2512` | `email rate limit exceeded` を日本語で案内。`RESEND_AUTH_SMTP_HANDOFF.md` を追加 |
| `58ebadf` | 回復メールが `www` のサイトルートへ戻しても、`type=recovery` のハッシュを保って `/reset-password` に送る処理を追加 |
| `3544234` | ログイン済みでゲーム内利用者行がない場合を「未ログイン」と誤表示せず、初回設定へ案内。ログイン成功後も未設定なら `/setup` へ遷移 |

主要ファイル:

- `apps/web/src/app/login/page.tsx` — Auth ログイン後に `public.users` の本人行を調べ、未設定なら `/setup`、設定済みなら `/home`。
- `apps/web/src/app/home/page.tsx` — 未ログイン、初回設定前、読み込み失敗を別のカードで表示。以前の「ログインして厩舎を見る」という誤表示を解消。
- `apps/web/src/components/uma/use-stable-view.ts` — 状態を `needsLogin` / `needsSetup` / 通常エラーに分類。
- `apps/web/src/lib/stable-repo.ts` — Auth セッション後、まず本人の `users` 行を確認。存在しない場合は `SetupRequiredError`。存在する場合だけ持ち馬・レース等を読む。
- `apps/web/src/app/layout.tsx` — ルートに届いた recovery フラグメントを `/reset-password` に移す。ハッシュ中の token は URL のまま移し、サーバー側に記録しない。
- `apps/web/src/app/forgot-password/page.tsx`、`reset-password/page.tsx` — Supabase Auth の再設定フロー。
- `apps/web/src/app/setup/page.tsx`、`apps/web/src/lib/setup.ts` — 初回牧場登録。`create_account` RPC が初期馬を選ぶ設計。

### 修正の根拠と限界

オーナーはログイン後の `/home` で「厩舎を取得できませんでした」「利用者情報を取得できませんでした。ログイン状態を確認してください」「ログインして厩舎を見る」と表示されると報告した。本番 DB の読み取り専用照合では、対象アカウントの **Auth ユーザーは存在しメール確認済み**、しかし **`public.users` 行は存在しない**。つまり認証成功とゲーム内初回設定未完了を、旧 UI が取り違えていた。

本番 `create_account` RPC の `p_horse_id` は既定値 `NULL` を持ち、省略可能。関数内で初期馬を選ぶ。調査中に「必須」と一度誤報告したが、関数定義を再確認して訂正済み。ただし **オーナーによる `/setup` の実登録成功はまだ見ていない**。UI の変更はビルド・型・PC 幅のブラウザ画面で確認したが、ログイン済み本番画面の最終状態を本人セッションでは確認できていない。

## 5. 認証・メールの実測

- オーナーは正式ドメイン `umamonogatari.com` を取得し、Supabase URL 設定と Resend にドメインを追加。Resend API キーを発行し、Supabase Custom SMTP を保存した。
- 当初 `POST /auth/v1/recover` は 429（メール送信制限）。Custom SMTP 設定直後は 500、Auth ログには `lookup smtp.resend.com・465: no such host`。Host 欄へホストとポートが一緒に入ったのが原因で、オーナーが `smtp.resend.com` と `465` に分けて修正した。その後の再設定メール送信要求は受理された。
- オーナーが回復リンクを開くと `https://www.umamonogatari.com/` の TOP が表示された。`58ebadf` により、ルートの recovery フラグメントを `/reset-password` へ移す処理を実装。ダミーのフラグメントでローカルと本番 `www` の遷移を確認した。本物の新パスワード設定完了は明示的に確認できていないが、後にオーナーからログイン後 `/home` の報告があった。
- Supabase Redirect URLs としてオーナーが示した値は `https://www.umamonogatari.com/`、`https://umamonogatari.com/reset-password`、`https://www.umamonogatari.com/reset-password`。現在設定は管理画面で再確認してよい。
- **重要:** オーナーが一度、アクセス・リフレッシュ token を含む回復 URL 全文を会話に貼った。この文書にもコードやログにも記載していない。次の担当も URL 全文を引用・保存・再利用しない。必要なら新しい回復メールを発行してもらう。
- ブラウザの認証セッションはホストごとに分かれる。`www` でログインしている人を案内するときは `https://www.umamonogatari.com/setup` を使う。apex の `https://umamonogatari.com/setup` へ移ると、別セッションとして扱われ得る。

`RESEND_AUTH_SMTP_HANDOFF.md` は設定値を記録しているが、旧本文には変更前の確認手順もある。実際に設定済みの箇所をもう一度「未設定」と決めつけない。

## 6. 画面検証の範囲

- `npm.cmd run gate`：worker build、strict 型検査、Next.js 本番 build、既知の赤の照合、未解決指摘の期限確認がすべて成功。
- ローカルの `/home` を PC 幅 1280px で実ブラウザ確認。未ログイン状態の中央カードが表示され、横あふれなし、44px 未満の操作対象なし。**これは未設定アカウントの本番認証画面を直接検証したことを意味しない。**
- 携帯幅 390px の自動ブラウザ確認は CDP `Page.enable` のタイムアウトで終了。レイアウト不合格と判定したわけではない。次回、ブラウザ環境を整えて確認する。
- `git diff --check` 合格。`3544234` の本番配信は `/api/healthz` で確認。

## 7. 次の作業と確認順

1. **オーナーの初回設定結果を確認。** 同じホストの `/setup` で表示名と牧場名を登録し、最初の 1 頭が表示されるか。失敗時は画面文言、時刻、通信のステータスを控え、`create_account` と `my_horses` のどちらで止まるか調べる。本人に代わって本番 DB の行を手作業で作らない。
2. **ログイン済み PC・スマートフォンの実画面を確認。** オーナーが「PC表示ではまず崩れている」と報告しており、今回の中央カード修正だけで全体のレイアウト品質が完成したとは言えない。少なくとも `/home`、`/setup`、`/login`、`/signup`、`/reset-password`、レース画面、主要ナビを確認する。
3. **認証フローを一通り通す。** 回復メール → 新パスワード設定 → ログイン → `/setup` → `/home`。頻繁なメール再送は制限に当たるので、目的を決めて最小回数にする。
4. **全 UI とレース表示の残課題を棚卸し。** 前日の `HANDOFF_UI_POLISH_20260921.md` と設計資料を照合し、新旧画面の取り違えを避ける。特に新しい `/home` `/vote` `/mypage` `/train` `/exchange` `/earn` `/howto` `/watch-race` を軸に見る。レースの常設表示・デモと実レースの境界を明確にする。
5. 変更後は `npm.cmd run gate`、本番ビルドと実ブラウザを確認する。ユーザーは以前、本番への push を指示済みで、このセッションでも `main` へ push した。ただし本番 DB・ワーカーの操作は別扱い。

## 8. 本番 DB・ワーカーの境界

前日の引継ぎ書で決まった順序は **本番の血統修復 → 移行 `0060` → `tools/deploy.sh`**。オーナーの明示的な許可前に実行しない。ワーカーを先に入れると `world_state.last_bred_week` が存在せず週送りが止まる可能性があり、過去に rollback で復旧した実例がある。`git push` は Web の配信であり、VPS の `star-worker` を更新しない。今回の認証 UI 修正にも、この 3 操作は不要。

## 9. 状態確認コマンド（PowerShell）

```powershell
git status --short --branch
git log -8 --oneline
git rev-parse origin/main
Invoke-RestMethod -Uri 'https://www.umamonogatari.com/api/healthz' -TimeoutSec 20 | ConvertTo-Json -Compress
npm.cmd run gate
```

`npm.cmd run gate` は数分かかる。ネットワークやブラウザが sandbox 制限で失敗した場合は、失敗理由を見て必要な権限で再実行する。認証情報・メール本文・token をコマンド出力に出さない。
