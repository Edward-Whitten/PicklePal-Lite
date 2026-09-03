(function () {
    const url = window.PICKLEPAL_SUPABASE_URL;
    const anonKey = window.PICKLEPAL_SUPABASE_ANON_KEY;
    const configured = url && anonKey && !url.includes('YOUR_PROJECT_REF') && !anonKey.includes('YOUR_SUPABASE');
    const client = configured && window.supabase ? window.supabase.createClient(url, anonKey) : null;
    let sessionToken = sessionStorage.getItem('picklepal_supabase_session') || '';
    let currentRole = sessionStorage.getItem('picklepal_supabase_role') || '';
    let currentTournament = sessionStorage.getItem('picklepal_supabase_tournament') || '';

    function slug(value) { return String(value || '').trim().toLowerCase(); }
    function apiUrl() { return `${url}/functions/v1/tournament-api`; }
    async function call(action, payload) {
        if (!configured) throw new Error('Supabase is not configured. Add project URL and publishable key to supabase-config.js.');
        const response = await fetch(apiUrl(), { method:'POST', headers:{'content-type':'application/json', apikey:anonKey, authorization:sessionToken ? `Bearer ${sessionToken}` : `Bearer ${anonKey}`}, body:JSON.stringify({ action, ...payload }) });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || 'Supabase request failed.');
        return data;
    }
    function remember(data, role, tournament) {
        sessionToken = data.sessionToken || sessionToken;
        currentRole = role || currentRole;
        currentTournament = slug(tournament || currentTournament);
        if (sessionToken) sessionStorage.setItem('picklepal_supabase_session', sessionToken);
        if (currentRole) sessionStorage.setItem('picklepal_supabase_role', currentRole);
        if (currentTournament) sessionStorage.setItem('picklepal_supabase_tournament', currentTournament);
    }
    function snapshot(value) { return { val: () => value }; }
    function extractTournament(path) { const match = String(path).match(/tournaments\/([^/]+)\/state/); return match ? slug(match[1]) : currentTournament; }

    window.db = { ref: function (path) { const tournament = extractTournament(path); if (path === '.info/connected') return { on: function (event, callback) { callback(snapshot(false)); if (configured) fetch(`${url}/rest/v1/tournaments?select=id&limit=1`, { headers:{ apikey:anonKey } }).then(response => callback(snapshot(response.ok))).catch(() => callback(snapshot(false))); } }; return {
        once: async function () { const data = await call('public', { tournament }); return snapshot(data.state); },
        on: function (event, callback) { this.once().then(callback).catch(error => console.warn('Supabase public read unavailable:', error.message)); if (client) client.channel(`tournament-${tournament}`).on('postgres_changes', { event:'UPDATE', schema:'public', table:'tournaments', filter:`code=eq.${tournament}` }, payload => callback(snapshot(payload.new.public_state))).subscribe(); },
        set: async function (state) { const kind = state && state.appMode === 'rr' ? 'round_robin' : 'tournament'; if (currentRole === 'admin') return call('admin-save', { tournament, state, kind }); if (currentRole === 'player') return call('score-report', { tournament, state, kind }); throw new Error('Authenticated Supabase session required.'); },
        remove: async function () { throw new Error('Tournament deletion is admin-only and must be implemented as a protected action.'); }
    }; } };
    window.auth = { currentUser: sessionToken ? { uid: `${currentRole}:${currentTournament}` } : null, signInWithCustomToken: async function (token) { sessionToken = token; this.currentUser = { uid: `${currentRole}:${currentTournament}` }; } };
    window.functions = { httpsCallable: function (name) { return async function (payload) {
        const map = { createTournament:'create', adminSession:'admin-login', playerSession:'player-login', saveTournamentState:'admin-save', submitScoreReport:'score-report' };
        const data = await call(map[name] || name, { ...payload, tournament: payload.tournament || currentTournament, kind: payload.kind || 'tournament' });
        if (name === 'createTournament') remember(data, 'admin', payload.nickname);
        if (name === 'adminSession') remember(data, 'admin', payload.tournament);
        if (name === 'playerSession') remember(data, 'player', payload.tournament);
        return { data: { token: data.sessionToken, teamId: data.teamId, state: data.state } };
    }; } };
    window.roundRobinApi = {
        load: payload => call('public', { ...payload, kind: 'round_robin' }),
        create: async payload => { const data = await call('create', { ...payload, kind: 'round_robin' }); remember(data, 'admin', payload.tournament); return data; },
        adminLogin: async payload => { const data = await call('admin-login', { ...payload, kind: 'round_robin' }); remember(data, 'admin', payload.tournament); return data; },
        playerLogin: async payload => { const data = await call('player-login', { ...payload, kind: 'round_robin' }); remember(data, 'player', payload.tournament); return data; },
        reportScore: payload => call('score-report', { ...payload, kind: 'round_robin' }),
        save: payload => call('admin-save', { ...payload, kind: 'round_robin' })
    };
    window.supabaseBridge = { configured, remember, call };
})();
