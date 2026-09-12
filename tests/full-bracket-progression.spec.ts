import { expect, test } from '@playwright/test';
import { seedTournament, tournamentState } from './fixtures';

declare const state: any;
declare function generateBracket(): Promise<void>;
declare function advR32(index: number, teamNum: number): void;
declare function advR16(index: number, teamNum: number): void;
declare function advQF(index: number, teamNum: number): void;
declare function advSF(index: number, teamNum: number): void;

function fullBracketState() {
  const base = tournamentState();
  const teams = Array.from({ length: 20 }, (_, index) => ({
    id: index + 1,
    pin: String(1000 + index + 1),
    p1: `Team ${index + 1} A`,
    p2: `Team ${index + 1} B`,
    checkedIn: true,
    pool: index % 4,
    wins: 1,
    losses: 0,
    pf: 11,
    pa: 7,
    pd: 4,
    active: true,
  }));
  return {
    ...base,
    expectedTeams: 20,
    advancementCount: 20,
    poolCount: 4,
    teams,
    completedMatches: { 'm-1-2': { s1: 11, s2: 7, teamAId: 1, teamBId: 2, status: 'confirmed' } },
  };
}

test('advances a 20-team bracket from play through championship and 3rd place', async ({ page }) => {
  await seedTournament(page, { manager: true, state: fullBracketState() });
  await page.goto('/index.html');
  await page.waitForFunction(() => typeof generateBracket === 'function');

  const result = await page.evaluate(async () => {
    (window as any).appAlert = async () => true;
    (window as any).appConfirm = async () => true;
    state.advancementCount = 20;
    await generateBracket();

    state.bracket.r32.forEach((match: any, index: number) => {
      if (match.t1 && match.t2) advR32(index, 1);
    });
    state.bracket.r16.forEach((match: any, index: number) => {
      if (match.t1 && match.t2) advR16(index, 1);
    });
    state.bracket.qf.forEach((match: any, index: number) => {
      if (match.t1 && match.t2) advQF(index, 1);
    });
    state.bracket.sf.forEach((match: any, index: number) => {
      if (match.t1 && match.t2) advSF(index, 1);
    });

    return {
      qfReady: state.bracket.qf.every((match: any) => match.t1 && match.t2),
      sfReady: state.bracket.sf.every((match: any) => match.t1 && match.t2),
      finalTeamIds: [state.bracket.final.t1?.id, state.bracket.final.t2?.id],
      thirdTeamIds: [state.bracket.third.t1?.id, state.bracket.third.t2?.id],
      sfWinnerIds: state.bracket.sf.map((match: any) => match.t1?.id),
      sfLoserIds: state.bracket.sf.map((match: any) => match.t2?.id),
    };
  });

  expect(result.qfReady).toBe(true);
  expect(result.sfReady).toBe(true);
  expect(result.finalTeamIds).toEqual(result.sfWinnerIds);
  expect(result.thirdTeamIds).toEqual(result.sfLoserIds);
});
