'use client';

/**
 * ★**ログアウト**（★2026-09-25・オーナー指摘「★サイトに今ログアウトボタンがありません」）
 *
 * 【🔴 ★なぜ要るか】
 *   ★**ログアウトする手段が、サイトのどこにもありませんでした。**
 *   ★一度ログインすると ★**別の口座に切り替えられません**（★開いた本人も、後で触る人も）。
 *   ★オーナーは ★**本番の一周を試すために新しい口座で入りたい**のに、★入れませんでした。
 *
 * 【★何をするか】
 *   ★`supabase` の session を捨て、★玄関（`/`）へ送ります。
 *   ⚠️ ★`signOut()` は ★**この端末に残っている鍵**を消します（★localStorage）。
 *      ★「キャッシュが残る」の正体はこれです。
 *   ⚠️ ★失敗しても ★**玄関へは送ります**（★押したのに何も起きない、を作らない）。
 *      ★ただし ★**「ログアウトしました」とは言いません**（★消えていないかもしれないので）。
 *
 * 【★意匠】
 *   ⚠️ ★新しい見た目を作っていません。★`BigButton`（`uma-parts`）の `ivory` をそのまま使います。
 */

import { useState } from 'react';
import { BigButton } from './uma-parts';
import { authClient } from '../../lib/supabase';

export function SignOutButton({ grow }: { readonly grow?: string }): React.ReactElement {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  return (
    <>
      <BigButton
        tone={busy ? 'disabled' : 'ivory'}
        label={busy ? '出ています…' : 'ログアウト'}
        sub={failed ? 'うまく消せませんでした' : 'ほかの牧場で入り直せます'}
        {...(grow === undefined ? {} : { grow })}
        onClick={() => {
          if (busy) return;
          setBusy(true);
          void authClient().auth.signOut()
            .catch(() => { setFailed(true); })
            .finally(() => { window.location.href = '/'; });
        }}
      />
    </>
  );
}
