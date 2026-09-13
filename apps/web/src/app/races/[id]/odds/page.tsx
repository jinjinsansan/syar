import { readClient } from '../../../../lib/supabase';
import { ReadError } from '../../../../components/ui';
import { OddsBoard, type OddsRow } from '../../../../components/odds-board';

export const revalidate = 0;

export default async function OddsPage({ params, searchParams }: {
  params: Promise<{ id: string }>; searchParams: Promise<{ type?: string }>;
}) {
  const { id } = await params;
  const { type } = await searchParams;
  const c = readClient();
  const [race, entries, odds] = await Promise.all([
    c.from('races_public').select('*').eq('id', id).single(),
    c.from('race_entries_public').select('*').eq('race_id', id).order('gate'),
    c.from('race_odds_public').select('*').eq('race_id', id).order('odds'),
  ]);
  if (race.error) return <ReadError message={race.error.message} />;
  if (odds.error) return <ReadError message={odds.error.message} />;
  return <OddsBoard race={race.data as OddsRow} entries={(entries.data ?? []) as OddsRow[]} odds={(odds.data ?? []) as OddsRow[]} type={type} oddsPath={`/races/${id}/odds`} />;
}
