// Correction pass: removes the two synthetic completedMatches entries that were mistakenly
// generated for m-1-3 and m-1-4 (they collided with the manager's real in-progress score
// reports for those matches), then recomputes every team's wins/losses/pf/pa/pd from the
// corrected completedMatches set only. Fetches fresh data right before writing the fix to
// minimize collision with the still-live simulation.
import { execFileSync } from 'node:child_process';
import { writeFileSync } from 'node:fs';

const BAD_KEYS = ['m-1-3', 'm-1-4'];

// Route through a temp .sql file (not an inline arg) to avoid shell-quoting issues on Windows.
function runQuery(sql) {
  writeFileSync('.tmp-query.sql', sql);
  const out = execFileSync('pnpm', ['dlx', 'supabase', 'db', 'query', '--file', '.tmp-query.sql', '--linked', '--project-ref', 'nkaosmhsvoantgqhtdap'], {
    encoding: 'utf8', shell: true, maxBuffer: 1024 * 1024 * 10,
  });
  const jsonStart = out.indexOf('{');
  return JSON.parse(out.slice(jsonStart)).rows[0];
}

const row = runQuery("select public_state->'teams' as teams, public_state->'completedMatches' as completed from public.tournaments where code='test' and event_type='tournament';");
const teams = row.teams;
const completed = row.completed;

for (const key of BAD_KEYS) delete completed[key];

const stats = new Map(teams.map(t => [t.id, { wins: 0, losses: 0, pf: 0, pa: 0, pd: 0 }]));
for (const match of Object.values(completed)) {
  const { teamAId, teamBId, s1, s2 } = match;
  const statA = stats.get(teamAId), statB = stats.get(teamBId);
  if (!statA || !statB) continue;
  if (s1 > s2) { statA.wins++; statB.losses++; } else { statB.wins++; statA.losses++; }
  statA.pf += s1; statA.pa += s2; statA.pd += s1 - s2;
  statB.pf += s2; statB.pa += s1; statB.pd += s2 - s1;
}

const updatedTeams = teams.map(t => ({ ...t, ...stats.get(t.id) }));

const sql = `update public.tournaments
set public_state = public_state || jsonb_build_object(
  'teams', '${JSON.stringify(updatedTeams).replace(/'/g, "''")}'::jsonb,
  'completedMatches', '${JSON.stringify(completed).replace(/'/g, "''")}'::jsonb
),
updated_at = now()
where code = 'test' and event_type = 'tournament';
`;

writeFileSync('fix-pool-play-conflict.sql', sql);
console.log(`Removed ${BAD_KEYS.join(', ')}. Remaining completed matches: ${Object.keys(completed).length}.`);
