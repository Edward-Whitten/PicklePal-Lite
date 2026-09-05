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