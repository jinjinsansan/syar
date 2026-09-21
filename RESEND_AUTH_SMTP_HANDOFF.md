# Supabase Auth のメール送信を Resend に切り替える

2026-09-22 時点。`umamonogatari.com` は本番サイトを配信中。再設定画面は Supabase Auth の `resetPasswordForEmail()` を使う。アプリ側に Resend API キーを置く必要はない。

## オーナーが Resend / Supabase の画面で行う設定

1. Resend の Domains で `umamonogatari.com` が **Verified** と表示されることを確認する。「追加済み」だけでは送信可能とは判定しない。
2. Resend で送信専用の API キーを発行する。キーはリポジトリ、チャット、Vercel の公開環境変数に置かない。
3. Supabase の対象プロジェクトで **Authentication → Emails → SMTP Settings** を開き、Custom SMTP を有効にして次を入力する。

| 項目 | 値 |
| --- | --- |
| Sender email | `no-reply@umamonogatari.com` |
| Sender name | `馬物語` |
| Host | `smtp.resend.com` |
| Port | `465` |
| Username | `resend` |
| Password | Resend で発行した API キー |

4. Supabase の **Authentication → URL Configuration** で Site URL と Redirect URL を確認する。正式ドメインで使う再設定リンクの戻り先は `https://umamonogatari.com/reset-password`。旧ドメインからも操作させる間は `https://star-two-chi.vercel.app/reset-password` も Redirect URL に必要。
5. Custom SMTP 保存後、Supabase の Auth メール送信上限を確認する。Custom SMTP の既定は 30 通/時。無制限にはならない。

## 切り替え後の実測

- `https://umamonogatari.com/forgot-password` から、オーナー自身の登録済みメールアドレス宛に **1 回だけ**再設定を依頼する。
- Resend の Logs で `sent` / `delivered` を確認し、メール内リンクが `https://umamonogatari.com/reset-password` を開くことを確認する。
- 新しいパスワードの設定とログインを確認する。Supabase Auth の既存セッション失効などの V-19 認証検査は別途必要。
- API キーは作業報告に載せず、Supabase の管理画面に直接入力する。

参考: [Supabase Custom SMTP](https://supabase.com/docs/guides/auth/auth-smtp)、[Resend SMTP](https://resend.com/changelog/smtp-service)、[Supabase Redirect URLs](https://supabase.com/docs/guides/auth/redirect-urls)。
