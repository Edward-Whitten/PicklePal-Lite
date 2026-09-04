import type { Page } from '@playwright/test';

export const tournamentCode = 'e2echeck';
export const managerPin = '1600';
export const playerAPin = '1111';
export const playerBPin = '2222';

export function tournamentState() {
  const teams = [
    { id: 1, pin: playerAPin, p1: 'Alexandra Verylonglastname', p2: 'Benjamin Example', checkedIn: true, pool: 0, wins: 1, losses: 0, pf: 11, pa: 7, pd: 4, active: true },
    { id: 2, pin: playerBPin, p1: 'Cameron Sample', p2: 'Devon Player', checkedIn: true, pool: 0, wins: 0, losses: 1, pf: 7, pa: 11, pd: -4, active: true },
    { id: 3, pin: '3333', p1: 'Emerson Test', p2: 'Finley Squad', checkedIn: true, pool: 0, wins: 0, losses: 0, pf: 0, pa: 0, pd: 0, active: true },
    { id: 4, pin: '4444', p1: 'Gray Team', p2: 'Harper Pair', checkedIn: true, pool: 0, wins: 0, losses: 0, pf: 0, pa: 0, pd: 0, active: true },
  ];

  return {
    appMode: 'tourney',
    tournamentNickname: tournamentCode,
    expectedTeams: 4,
    advancementCount: 4,
    poolCount: 1,
    theme: 'dark',
    setupMode: 'manual',
    header: { title: 'E2E Tournament', date: '2026-09-04', loc: 'Test Courts', org: 'Auralogic Solutions', man: 'QA Manager', logoDarkTheme: 'Compass-Logo-White.png', logoLightTheme: 'Compass-Logo-White.png' },
    teams,
    completedMatches: {},
    scoreReports: {},
    poolSchedule: [],
    courts: {},
    stranded: [],
  };
}

export async function seedTournament(page: Page, options: { manager?: boolean; player?: boolean } = {}) {
  const state = tournamentState();
  await page.addInitScript(({ code, serializedState, manager, player }) => {
    localStorage.setItem(`picklepal_tournament_${code}`, serializedState);
    if (manager) {
      localStorage.setItem('picklepal_active_tournament', code);
      localStorage.setItem('picklepal_admin_session', code);
    }
    if (player) {
      localStorage.setItem('picklepal_portal_nickname', code);
      localStorage.setItem('picklepal_portal_role', 'player');
    }
  }, { code: tournamentCode, serializedState: JSON.stringify(state), manager: Boolean(options.manager), player: Boolean(options.player) });
}

export async function expectNoHorizontalOverflow(page: Page) {
  return page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
}