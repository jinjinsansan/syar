import { notFound } from 'next/navigation';
import { OddsBoard, type OddsRow } from '../../../components/odds-board';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'オッズのデザイン見本｜馬物語', robots: { index: false, follow: false } };

/** Development-only fixture. Live routes never fall back to invented odds. */
export default async function OddsPreview({ searchParams }: { searchParams: Promise<{ type?: string }> }) {
  if (process.env.NODE_ENV !== 'development') notFound();
  const { type } = await searchParams;
  const names = ['サクラブリーズ','ホクトリュウセイ','トキメキステップ','ゲンブノツルギ','シラユキノヒメ','カガヤキボシ'];
  const race: OddsRow = { name: 'デザイン確認用レース', class_rank: 6, grade: 'GIII', surface: 'turf', distance: 1600, status: 'settled' };
  const entries: OddsRow[] = names.map((horse_name, i) => ({ gate: i + 1, horse_name }));
  const odds: OddsRow[] = [2.4, 4.8, 7.2, 12.5, 23.8, 41.6].flatMap((value, i) => [
    { bet_type: 'win', selection: [i + 1], odds: value, capped: false },
    { bet_type: 'place', selection: [i + 1], odds: Number((1.2 + i * .6).toFixed(1)), capped: false },
  ]);
  odds.push(...['quinella_place','quinella','exacta','trio','trifecta'].flatMap((bet_type) => [
    { bet_type, selection: bet_type === 'trio' || bet_type === 'trifecta' ? [1, 2, 3] : [1, 2], odds: 15.8, capped: false },
    { bet_type, selection: bet_type === 'trio' || bet_type === 'trifecta' ? [1, 3, 4] : [1, 3], odds: 24.6, capped: false },
  ]));
  return <><p className="story-preview-notice">デザイン見本：馬名・オッズは表示確認用のサンプルです。実際の開催・投票データではありません。</p><OddsBoard race={race} entries={entries} odds={odds} type={type} oddsPath="/design-preview/odds" /></>;
}
