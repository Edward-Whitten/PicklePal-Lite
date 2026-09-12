// Generates randomized, realistic pool-play scores for every remaining pending match
// in the live 'test' tournament, then emits a SQL patch (complete-pool-play.sql).
// Matches already present in completedMatches or scoreReports are left untouched.
import { writeFileSync } from 'node:fs';

// Snapshot fetched live from Supabase moments before running this script. public_state.teams
// never carries "pin" (the app strips it before persisting; team_access holds it separately),
// and every stat is still zero -- no pool-play scores have been recorded except the skip below.
const names = [
  ['Mark Smith', 'David Lee'], ['Sarah Johnson', 'Emily Carter'], ['Kevin Brown', 'Justin Walker'],
  ['Linda Martinez', 'Susan Clark'], ['Ryan Thompson', 'Eric Rodriguez'], ['Jessica Davis', 'Michelle Garcia'],
  ['Brian Wilson', 'Timothy Moore'], ['Amanda White', 'Nicole Harris'], ['Jason Anderson', 'Patrick Young'],
  ['Karen Robinson', 'Rachel Lewis'], ['Scott Taylor', 'Henry Jackson'], ['Melissa Adams', 'Stephanie King'],
  ['Gary Martin', 'Larry Perez'], ['Angela Campbell', 'Christine Mitchell'], ['Adam Hernandez', 'Douglas Flores'],
  ['Kimberly Hall', 'Rebecca Rivera'], ['Jeffrey Sanchez', 'Frank Torres'], ['Laura Nguyen', 'Megan Baker'],
  ['Raymond Green', 'Dennis Nelson'], ['Jerry Roberts', 'Aaron Allen'], ['Paul Ramirez', 'Steven Wright'],
  ['Amy Foster', 'Christina Brooks'], ['Nathan Reed', 'Tyler Coleman'], ['Victoria Bennett', 'Samantha Price'],
  ['Derek Simmons', 'Gregory Hayes'], ['Olivia Peterson', 'Grace Sullivan'], ['Marcus Bryant', 'Alan Griffin'],
  ['Natalie Ross', 'Diana Cook'], ['Charles Morgan', 'Brandon Ward'],
];
const teams = names.map(([p1, p2], i) => {
  const id = i + 1;
  const pool = id <= 5 ? 0 : id <= 10 ? 1 : id <= 15 ? 2 : id <= 20 ? 3 : id <= 25 ? 4 : 5;
  return {
    id, pool, p1, p2, active: true, checkedIn: true, p1Locked: true, p2Locked: true,
    p1CheckedIn: true, p2CheckedIn: true, wins: 0, losses: 0, pf: 0, pa: 0, pd: 0,
  };
});
// matchIds that already have a score entered (completed or a one-sided report) -- do not touch these.
const alreadyEntered = new Set(['m-1-2']);

function pairsForPool(poolTeams) {
  const pairs = [];
  for (let a = 0; a < poolTeams.length; a++) {
    for (let b = a + 1; b < poolTeams.length; b++) pairs.push([poolTeams[a].id, poolTeams[b].id]);
  }
  return pairs;
}

const pools = new Map();
teams.forEach(t => {
  if (!pools.has(t.pool)) pools.set(t.pool, []);
  pools.get(t.pool).push(t);
});
for (const list of pools.values()) list.sort((a, b) => a.id - b.id);

const allPairs = [...pools.values()].flatMap(pairsForPool);

// First-to-11, win-by-2: blowouts skip straight to 11, close games extend past deuce (up to 15-13).
function randomScore() {
  if (Math.random() < 0.6) {
    const winner = 11 + Math.floor(Math.random() * 5); // 11-15
    return [winner, winner - 2];
  }
  const loser = Math.floor(Math.random() * 7); // 0-6, margin 5-11
  return [11, loser];
}

const completedMatches = {};
const stats = new Map(teams.map(t => [t.id, { wins: 0, losses: 0, pf: 0, pa: 0, pd: 0 }]));
let generated = 0;

for (const [idA, idB] of allPairs) {
  const matchId = `m-${idA}-${idB}`;
  if (alreadyEntered.has(matchId)) continue;
  const [winnerScore, loserScore] = randomScore();
  const aWins = Math.random() < 0.5;
  const s1 = aWins ? winnerScore : loserScore;
  const s2 = aWins ? loserScore : winnerScore;
  completedMatches[matchId] = { s1, s2, teamAId: idA, teamBId: idB, status: 'confirmed', resolvedBy: 'admin', resolvedAt: new Date().toISOString(), correctedFrom: null };
  const statA = stats.get(idA), statB = stats.get(idB);
  if (s1 > s2) { statA.wins++; statB.losses++; } else { statB.wins++; statA.losses++; }
  statA.pf += s1; statA.pa += s2; statA.pd += s1 - s2;
  statB.pf += s2; statB.pa += s1; statB.pd += s2 - s1;
  generated++;
}

const updatedTeams = teams.map(t => ({ ...t, ...stats.get(t.id) }));

const sql = `update public.tournaments
set public_state = public_state || jsonb_build_object(
  'teams', '${JSON.stringify(updatedTeams).replace(/'/g, "''")}'::jsonb,
  'completedMatches', (public_state->'completedMatches') || '${JSON.stringify(completedMatches).replace(/'/g, "''")}'::jsonb
),
updated_at = now()
where code = 'test' and event_type = 'tournament';
`;

writeFileSync('complete-pool-play.sql', sql);
console.log(`Generated ${generated} matches out of ${allPairs.length} total pool-play pairings.`);
console.log(`Skipped (already entered): ${[...alreadyEntered].join(', ') || 'none'}`);
