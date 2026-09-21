// Read-only smoke check for the public race replay fields. Prints no credentials or horse names.
const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!url || !key) throw new Error('Public Supabase environment is missing');
const headers = { apikey: key, Authorization: `Bearer ${key}` };
const raceResponse = await fetch(
  `${url}/rest/v1/races_public?select=id,scheduled_at,distance,status&status=eq.settled&order=scheduled_at.desc&limit=1`,
  { headers },
);
if (!raceResponse.ok) throw new Error(`races_public HTTP ${raceResponse.status}`);
const races = await raceResponse.json();
if (races.length === 0) {
  process.stdout.write('No settled race found\n');
  process.exit(0);
}
const entriesResponse = await fetch(
  `${url}/rest/v1/race_entries_public?select=gate,horse_name,strategy,finish_pos,finish_time&race_id=eq.${encodeURIComponent(races[0].id)}&order=gate`,
  { headers },
);
if (!entriesResponse.ok) throw new Error(`race_entries_public HTTP ${entriesResponse.status}`);
const entries = await entriesResponse.json();
const finished = entries.filter((row) => row.finish_pos !== null);
const byTime = [...finished].sort((a, b) => Number(a.finish_time) - Number(b.finish_time) || Number(a.gate) - Number(b.gate));
const replayCompatible = byTime.length > 0 && byTime.every((row, index) =>
  Number(row.finish_pos) === index + 1
  && Number.isFinite(Number(row.finish_time))
  && ['nige', 'senko', 'sashi', 'oikomi'].includes(row.strategy),
);
process.stdout.write(JSON.stringify({
  raceStatus: races[0].status,
  entryCount: entries.length,
  finishedCount: finished.length,
  replayCompatible,
  fields: Object.keys(entries[0] ?? {}),
}) + '\n');
if (!replayCompatible) process.exitCode = 1;
