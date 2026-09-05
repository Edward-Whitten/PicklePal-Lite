(function () {
    const url = window.PICKLEPAL_SUPABASE_URL;
    const anonKey = window.PICKLEPAL_SUPABASE_ANON_KEY;
    const configured = url && anonKey && !url.includes('YOUR_PROJECT_REF') && !anonKey.includes('YOUR_SUPABASE');
    const client = configured && window.supabase ? window.supabase.createClient(url, anonKey) : null;
    const requestCache = new Map();
    const channels = new Map();
    let sessionToken = safeSessionGet('picklepal_supabase_session');
    let currentRole = safeSessionGet('picklepal_supabase_role');
    let currentTournament = safeSessionGet('picklepal_supabase_tournament');

    function slug(value) { return String(value || '').trim().toLowerCase(); }
    function apiUrl() { return `${url}/functions/v1/tournament-api`; }
    function delay(ms) { return new Promise(resolve => setTimeout(resolve, ms)); }
    function safeSessionGet(key) { try { return sessionStorage.getItem(key) || ''; } catch (error) { return ''; } }
    function safeSessionSet(key, value) { try { if (value) sessionStorage.setItem(key, value); } catch (error) {} }
    function requestKey(action, payload) { return `${action}:${JSON.stringify(payload || {})}`; }
    function forgetTournament(tournament) {
        const target = slug(tournament);
        for (const key of requestCache.keys()) {
            if (key.includes(`"tournament":"${target}"`)) requestCache.delete(key);
        }
        const channel = channels.get(`tournament-${target}`);
        if (channel && client) {
            try { client.removeChannel(channel); } catch (error) {}
            channels.delete(`tournament-${target}`);
        }
        if (currentTournament === target) {
            currentTournament = '';
            sessionToken = '';
            currentRole = '';
            try {
                sessionStorage.removeItem('picklepal_supabase_session');
                sessionStorage.removeItem('picklepal_supabase_role');
                sessionStorage.removeItem('picklepal_supabase_tournament');
            } catch (error) {}
        }
    }
    function isTransient(error, response) { return !response || response.status === 408 || response.status === 429 || response.status >= 500 || /abort|timeout|network|failed|fetch/i.test(String(error && error.message || '')); }
    async function parseResponse(response) { try { return await response.json(); } catch (error) { return {}; } }
    async function fetchWithTimeout(resource, options, timeout = 8000) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), timeout);
        try { return await fetch(resource, { ...options, signal: controller.signal }); }
        finally { clearTimeout(timer); }
    }
    async function attemptCall(action, payload) {
        const response = await fetchWithTimeout(apiUrl(), { method:'POST', headers:{'content-type':'application/json', apikey:anonKey, authorization:sessionToken ? `Bearer ${sessionToken}` : `Bearer ${anonKey}`}, body:JSON.stringify({ action, ...payload }) });
        const data = await parseResponse(response);
        if (!response.ok) {
            const error = new Error(data.error || `Supabase request failed (${response.status}).`);
            error.response = response;
            error.data = data;
            throw error;
        }
        return data;
    }
    async function call(action, payload) {
        if (!configured) throw new Error('Supabase is not configured. Add project URL and publishable key to supabase-config.js.');
        const key = requestKey(action, payload);
        if (requestCache.has(key)) return requestCache.get(key);
        const request = (async () => {
            let lastError;
            for (let attempt = 0; attempt < 3; attempt++) {
                try { return await attemptCall(action, payload); }
                catch (error) {
                    lastError = error;
                    if (!isTransient(error, error.response) || attempt === 2) throw error;
                    await delay(250 * Math.pow(2, attempt));
                }
            }
            throw lastError;
        })().finally(() => requestCache.delete(key));
        requestCache.set(key, request);
        return request;
    }
    function remember(data, role, tournament) {
        sessionToken = data.sessionToken || sessionToken;
        currentRole = role || currentRole;
        currentTournament = slug(tournament || currentTournament);
        safeSessionSet('picklepal_supabase_session', sessionToken);
        safeSessionSet('picklepal_supabase_role', currentRole);
        safeSessionSet('picklepal_supabase_tournament', currentTournament);
    }
    function snapshot(value) { return { val: () => value }; }
    function extractTournament(path) { const match = String(path).match(/tournaments\/([^/]+)\/state/); return match ? slug(match[1]) : currentTournament; }

    function subscribeTournament(tournament, callback) {
        if (!client) return null;
        const name = `tournament-${tournament}`;
        if (channels.has(name)) return channels.get(name);
        const channel = client.channel(name).on('postgres_changes', { event:'UPDATE', schema:'public', table:'tournaments', filter:`code=eq.${tournament}` }, payload => callback(snapshot(payload.new.public_state))).subscribe();
        channels.set(name, channel);
        return channel;
    }
    function cleanupChannels() { channels.forEach(channel => { try { client && client.removeChannel(channel); } catch (error) {} }); channels.clear(); }
    window.addEventListener('pagehide', cleanupChannels);
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') cleanupChannels(); });

    window.db = { ref: function (path) { const tournament = extractTournament(path); if (path === '.info/connected') return { on: function (event, callback) { callback(snapshot(false)); if (configured) fetchWithTimeout(apiUrl(), { method:'OPTIONS', headers:{ apikey:anonKey, authorization:`Bearer ${anonKey}` } }, 5000).then(response => callback(snapshot(response.ok))).catch(() => callback(snapshot(false))); } }; return {
        once: async function () { const data = await call('public', { tournament }); return snapshot(data.state); },
        on: function (event, callback) { this.once().then(callback).catch(error => console.warn('Supabase public read unavailable:', error.message)); const channel = subscribeTournament(tournament, callback); return function unsubscribe() { if (channel && client) { try { client.removeChannel(channel); channels.delete(`tournament-${tournament}`); } catch (error) {} } }; },
        set: async function (state) { const kind = state && state.appMode === 'rr' ? 'round_robin' : 'tournament'; if (currentRole === 'admin') return call('admin-save', { tournament, state, kind }); if (currentRole === 'player') return call('score-report', { tournament, state, kind }); throw new Error('Authenticated Supabase session required.'); },
        remove: async function () { const result = await call('delete-event', { tournament, kind:'tournament' }); forgetTournament(tournament); return result; }
    }; } };
    window.auth = { currentUser: sessionToken ? { uid: `${currentRole}:${currentTournament}` } : null, signInWithCustomToken: async function (token) { sessionToken = token; this.currentUser = { uid: `${currentRole}:${currentTournament}` }; } };
    window.functions = { httpsCallable: function (name) { return async function (payload) {
        const map = { createTournament:'create', adminSession:'admin-login', playerSession:'player-login', playerIdentify:'player-identify', saveTournamentState:'admin-save', submitScoreReport:'score-report', checkInTeam:'player-checkin', checkInPlayer:'player-checkin' };
        const data = await call(map[name] || name, { ...payload, tournament: payload.tournament || payload.nickname || currentTournament, kind: payload.kind || 'tournament' });
        if (name === 'createTournament') remember(data, 'admin', payload.nickname);
        if (name === 'adminSession') remember(data, 'admin', payload.tournament);
        if (name === 'playerSession' || name === 'playerIdentify') remember(data, 'player', payload.tournament);
        return { data: { token: data.sessionToken, playerId: data.playerId, playerSlot: data.playerSlot, teamId: data.teamId, team: data.team, state: data.state, scorePin: data.scorePin, status: data.status, teamCheckedIn: data.teamCheckedIn, stranded: data.stranded } };
    }; } };
    window.roundRobinApi = {
        load: payload => call('public', { ...payload, kind: 'round_robin' }),
        create: async payload => { const data = await call('create', { ...payload, kind: 'round_robin' }); remember(data, 'admin', payload.tournament); return data; },
        adminLogin: async payload => { const data = await call('admin-login', { ...payload, kind: 'round_robin' }); remember(data, 'admin', payload.tournament); return data; },
        playerLogin: async payload => { const data = await call('player-login', { ...payload, kind: 'round_robin' }); remember(data, 'player', payload.tournament); return data; },
        reportScore: payload => call('score-report', { ...payload, kind: 'round_robin' }),
        save: payload => call('admin-save', { ...payload, kind: 'round_robin' }),
        remove: async payload => { const result = await call('delete-event', { ...payload, kind: 'round_robin' }); forgetTournament(payload.tournament); return result; }
    };
    window.supabaseBridge = { configured, remember, call, forgetTournament };
})();
