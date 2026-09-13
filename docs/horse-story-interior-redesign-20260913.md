# 馬物語 内部ページのリデザイン

## 変更前の復元点

- タグ: `before-umamonogatari-interior-redesign-20260913`
- コミット: `eafe73e`
- ブランチ: `p4/race-30sec-cuts`
- 変更前の内部ページと、最初のアイボリー・緑の動くLPを保存済み。
- 研究用の未追跡画像、プロンプト、`.claude/` は保存対象に含めていない。

## デザイン

背景はLPと同じ `#f8f7ef`、主要操作は `#315c45`、文字は `#203b34`。
明朝体はページ見出しとブランドに使用し、データ・数値・操作はゴシック体。
枠色、EP/PP、人気上位の強調、警告、選択、利用不可状態の区別を維持する。

`StoryShell` が牧場・馬詳細・調教・番組表・オッズ・投票・出走登録・記録・景品・ログイン・登録・初期設定にだけテーマを適用する。
既存LP、`/lp-preview`、レース描画、研究ページはテーマの対象外。
実際のTOP `/` の切り替えは行っていない。内部ヘッダーの「馬物語」は `/lp-preview` へリンクする。

## 関連ファイル

変更した既存ファイル:

- `apps/web/src/app/layout.tsx`
- `apps/web/src/components/ui.tsx`
- `apps/web/src/app/races/[id]/odds/page.tsx`
- `apps/web/src/app/races/[id]/bet/page.tsx`
- `apps/web/src/app/stable/[horseId]/page.tsx`
- `apps/web/src/app/training/page.tsx`

追加ファイル:

- `apps/web/src/app/story-theme.css`
- `apps/web/src/components/story-shell.tsx`
- `apps/web/src/components/odds-board.tsx`
- `apps/web/src/app/design-preview/odds/page.tsx`
- `tools/check-story-interiors.mjs`
- 本文書

戻す場合は、後続作業の差分を確認・保存してから上記の既存ファイルをタグの版へ復元する。
追加ファイルは後続変更がないことを確認して退避または削除する。
ワークツリー全体のリセットや、無関係な未追跡ファイルの一括削除は不要。

## 確認先と制限

- `/stable`、`/training`、`/entry`、`/records`、`/prizes` などで内部デザインを確認できる。
- `/design-preview/odds` は開発環境限定のサンプル。実データのページと同じ `OddsBoard` を使う。
- サンプルである旨を画面に表示し、本番では404。実オッズ取得失敗時の代替データには使わない。
- 確認時、`/races` はデータ読み取りエラー。実データを使った番組表・オッズの最終確認は未完了。
- 型検査は `npm.cmd run typecheck`。
- ブラウザ検査は `node tools/check-story-interiors.mjs`。対象を絞る場合は `--quick`。
- スクリーンショット・検査記録: `out/story-interiors/`。
