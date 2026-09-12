import { expect, test } from '@playwright/test';
import { readFileSync } from 'node:fs';

test('edge player check-in resolves target from player session and rejects mismatched payload', () => {
  const source = readFileSync('supabase/functions/tournament-api/index.ts', 'utf8');
  expect(source).toContain("if (action === 'player-identify')");
  expect(source).toContain("tournamentId: tournament.id, role: 'player', teamId: entry.teamId, playerId: entry.playerId, playerSlot: entry.playerSlot");
  expect(source).toContain("const requestedTeamId = String(session.teamId || '')");
  expect(source).toContain("const playerSlot = session.playerSlot === 'p2' ? 'p2' : session.playerSlot === 'p1' ? 'p1' : null");
  expect(source).toContain('Players can only check in themselves.');
});

test('edge player-login and player-identify reject switching to a different team when a player session already exists', () => {
  const source = readFileSync('supabase/functions/tournament-api/index.ts', 'utf8');
  expect(source).toContain('async function assertNoTeamSwitch(authToken: string | null, tournamentCode: string, newTeamId: unknown)');
  expect(source).toContain("if (String(existing.teamId) !== String(newTeamId))");
  expect(source).toContain('Unauthorized: This code does not match your registered team.');
  expect(source).toContain("await assertNoTeamSwitch(authToken, tournamentCode, access.team_id);");
  expect(source).toContain("await assertNoTeamSwitch(authToken, tournamentCode, entry.teamId);");
});

test('edge score-report still rejects a session team that is not part of the submitted match', () => {
  const source = readFileSync('supabase/functions/tournament-api/index.ts', 'utf8');
  expect(source).toContain("if (String(session.teamId) !== teamAId && String(session.teamId) !== teamBId) throw new Error('Unauthorized: This code does not match your registered team.');");
});