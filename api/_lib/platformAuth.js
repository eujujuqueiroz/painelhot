import {
    buildAdminProfilesUrl,
    buildPlatformCallbackUrl,
    getPlatformDefinition,
    getPlatformEnvStatus,
    getRequestOrigin
} from './platformCatalog.js';
import { buildXOAuthHeader } from './xOAuth.js';
import { normalizeState, writeState } from './socialHub.js';

function redirect(url) {
    return new Response(null, {
        status: 302,
        headers: {
            location: url
        }
    });
}

async function readJsonResponse(response, fallbackMessage) {
    const rawText = await response.text();
    let data = null;

    try {
        data = rawText ? JSON.parse(rawText) : null;
    } catch (error) {
        data = null;
    }

    if (!response.ok) {
        const message = data?.error_description
            || data?.error?.message
            || data?.message
            || rawText
            || fallbackMessage;

        throw new Error(message);
    }

    return data;
}

function buildExpiryDate(expiresInSeconds) {
    if (!Number.isFinite(Number(expiresInSeconds))) {
        return null;
    }

    return new Date(Date.now() + Number(expiresInSeconds) * 1000).toISOString();
}

async function persistAuthSession(client, state, session) {
    state.authSessions = [
        ...state.authSessions.filter((entry) => entry.platformKey !== session.platformKey),
        session
    ];

    return writeState(client, state);
}

function consumeAuthSession(state, matcher) {
    const nextState = normalizeState(state);
    const matchedSession = nextState.authSessions.find(matcher);

    nextState.authSessions = nextState.authSessions.filter((session) => session.id !== matchedSession?.id);

    return {
        state: nextState,
        session: matchedSession || null
    };
}

function truncate(value, maxLength) {
    const input = String(value || '').trim();
    if (!input) {
        return '';
    }

    return input.length > maxLength ? `${input.slice(0, maxLength - 1)}…` : input;
}

async function requestYoutubeTokens(origin, code) {
    const env = getPlatformEnvStatus('youtube').values;
    const response = await fetch('https://oauth2.googleapis.com/token', {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: new URLSearchParams({
            client_id: env.YOUTUBE_CLIENT_ID,
            client_secret: env.YOUTUBE_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: buildPlatformCallbackUrl(origin, 'youtube')
        })
    });

    return readJsonResponse(response, 'Falha ao trocar o codigo do YouTube por token.');
}

async function fetchYoutubeProfile(accessToken) {
    const response = await fetch('https://www.googleapis.com/youtube/v3/channels?part=snippet&mine=true', {
        headers: {
            authorization: `Bearer ${accessToken}`
        }
    });

    const data = await readJsonResponse(response, 'Falha ao carregar o canal do YouTube.');
    const channel = data?.items?.[0];

    if (!channel) {
        throw new Error('Nenhum canal do YouTube foi encontrado para essa autorizacao.');
    }

    return {
        accountId: channel.id || '',
        handle: channel.snippet?.title || 'Canal do YouTube',
        avatarUrl: channel.snippet?.thumbnails?.default?.url || '',
        profileUrl: channel.id ? `https://www.youtube.com/channel/${channel.id}` : ''
    };
}

async function requestTikTokTokens(origin, code) {
    const env = getPlatformEnvStatus('tiktok').values;
    const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8',
            'cache-control': 'no-cache'
        },
        body: new URLSearchParams({
            client_key: env.TIKTOK_CLIENT_KEY,
            client_secret: env.TIKTOK_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: buildPlatformCallbackUrl(origin, 'tiktok')
        })
    });

    return readJsonResponse(response, 'Falha ao trocar o codigo do TikTok por token.');
}

async function fetchTikTokProfile(accessToken) {
    const creatorResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${accessToken}`,
            'content-type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({})
    });

    const creatorData = await readJsonResponse(creatorResponse, 'Falha ao carregar os dados do TikTok.');
    const creator = creatorData?.data || {};

    const username = creator.creator_username || creator.creator_nickname || 'Conta TikTok';

    return {
        accountId: creator.open_id || '',
        handle: username.startsWith('@') ? username : `@${username}`,
        avatarUrl: creator.creator_avatar_url || '',
        profileUrl: creator.creator_username ? `https://www.tiktok.com/@${creator.creator_username}` : '',
        metadata: {
            creatorInfo: creator
        }
    };
}

async function requestThreadsTokens(origin, code) {
    const env = getPlatformEnvStatus('threads').values;

    const shortTokenResponse = await fetch('https://graph.threads.net/oauth/access_token', {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: new URLSearchParams({
            client_id: env.THREADS_CLIENT_ID,
            client_secret: env.THREADS_CLIENT_SECRET,
            code,
            grant_type: 'authorization_code',
            redirect_uri: buildPlatformCallbackUrl(origin, 'threads')
        })
    });

    const shortToken = await readJsonResponse(shortTokenResponse, 'Falha ao trocar o codigo do Threads por token.');

    const exchangeUrl = new URL('https://graph.threads.net/access_token');
    exchangeUrl.searchParams.set('grant_type', 'th_exchange_token');
    exchangeUrl.searchParams.set('client_secret', env.THREADS_CLIENT_SECRET);
    exchangeUrl.searchParams.set('access_token', shortToken.access_token);

    const longTokenResponse = await fetch(exchangeUrl);
    const longToken = await readJsonResponse(longTokenResponse, 'Falha ao obter o token longo do Threads.');

    return {
        access_token: longToken.access_token,
        expires_in: longToken.expires_in,
        short_user_id: shortToken.user_id || ''
    };
}

async function fetchThreadsProfile(accessToken) {
    const profileResponse = await fetch('https://graph.threads.net/v1.0/me?fields=id,username,name,threads_profile_picture_url', {
        headers: {
            authorization: `Bearer ${accessToken}`
        }
    });

    const profile = await readJsonResponse(profileResponse, 'Falha ao carregar o perfil do Threads.');

    return {
        accountId: profile.id || '',
        handle: profile.username ? `@${profile.username}` : (profile.name || 'Perfil Threads'),
        avatarUrl: profile.threads_profile_picture_url || '',
        profileUrl: profile.username ? `https://www.threads.com/@${profile.username}` : ''
    };
}

async function requestInstagramTokens(origin, code) {
    const env = getPlatformEnvStatus('instagram').values;

    const shortTokenResponse = await fetch('https://api.instagram.com/oauth/access_token', {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: new URLSearchParams({
            client_id: env.INSTAGRAM_CLIENT_ID,
            client_secret: env.INSTAGRAM_CLIENT_SECRET,
            grant_type: 'authorization_code',
            redirect_uri: buildPlatformCallbackUrl(origin, 'instagram'),
            code
        })
    });

    const shortToken = await readJsonResponse(shortTokenResponse, 'Falha ao trocar o codigo do Instagram por token.');

    const exchangeUrl = new URL('https://graph.instagram.com/access_token');
    exchangeUrl.searchParams.set('grant_type', 'ig_exchange_token');
    exchangeUrl.searchParams.set('client_secret', env.INSTAGRAM_CLIENT_SECRET);
    exchangeUrl.searchParams.set('access_token', shortToken.access_token);

    const longTokenResponse = await fetch(exchangeUrl);
    const longToken = await readJsonResponse(longTokenResponse, 'Falha ao obter o token longo do Instagram.');

    return {
        access_token: longToken.access_token,
        expires_in: longToken.expires_in,
        short_user_id: shortToken.user_id || ''
    };
}

async function fetchInstagramProfile(accessToken) {
    const profileResponse = await fetch('https://graph.instagram.com/me?fields=id,username', {
        headers: {
            authorization: `Bearer ${accessToken}`
        }
    });

    const profile = await readJsonResponse(profileResponse, 'Falha ao carregar o perfil do Instagram.');

    return {
        accountId: profile.id || '',
        handle: profile.username ? `@${profile.username}` : 'Conta Instagram',
        avatarUrl: '',
        profileUrl: profile.username ? `https://www.instagram.com/${profile.username}/` : ''
    };
}

function buildYoutubeAuthUrl(origin, sessionId) {
    const env = getPlatformEnvStatus('youtube').values;
    const definition = getPlatformDefinition('youtube');
    const url = new URL('https://accounts.google.com/o/oauth2/v2/auth');
    url.searchParams.set('client_id', env.YOUTUBE_CLIENT_ID);
    url.searchParams.set('redirect_uri', buildPlatformCallbackUrl(origin, 'youtube'));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', definition.scopes.join(' '));
    url.searchParams.set('access_type', 'offline');
    url.searchParams.set('include_granted_scopes', 'true');
    url.searchParams.set('prompt', 'consent');
    url.searchParams.set('state', sessionId);
    return url.toString();
}

function buildTikTokAuthUrl(origin, sessionId) {
    const env = getPlatformEnvStatus('tiktok').values;
    const definition = getPlatformDefinition('tiktok');
    const url = new URL('https://www.tiktok.com/v2/auth/authorize/');
    url.searchParams.set('client_key', env.TIKTOK_CLIENT_KEY);
    url.searchParams.set('scope', definition.scopes.join(','));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('redirect_uri', buildPlatformCallbackUrl(origin, 'tiktok'));
    url.searchParams.set('state', sessionId);
    return url.toString();
}

function buildThreadsAuthUrl(origin, sessionId) {
    const env = getPlatformEnvStatus('threads').values;
    const definition = getPlatformDefinition('threads');
    const url = new URL('https://threads.net/oauth/authorize');
    url.searchParams.set('client_id', env.THREADS_CLIENT_ID);
    url.searchParams.set('redirect_uri', buildPlatformCallbackUrl(origin, 'threads'));
    url.searchParams.set('scope', definition.scopes.join(','));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('state', sessionId);
    return url.toString();
}

function buildInstagramAuthUrl(origin, sessionId) {
    const env = getPlatformEnvStatus('instagram').values;
    const definition = getPlatformDefinition('instagram');
    const url = new URL('https://www.instagram.com/oauth/authorize');
    url.searchParams.set('client_id', env.INSTAGRAM_CLIENT_ID);
    url.searchParams.set('redirect_uri', buildPlatformCallbackUrl(origin, 'instagram'));
    url.searchParams.set('response_type', 'code');
    url.searchParams.set('scope', definition.scopes.join(','));
    url.searchParams.set('state', sessionId);
    return url.toString();
}

async function requestXRequestToken(origin) {
    const callbackUrl = buildPlatformCallbackUrl(origin, 'x');
    const endpoint = 'https://api.x.com/oauth/request_token';
    const body = new URLSearchParams({
        oauth_callback: callbackUrl
    }).toString();

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            authorization: buildXOAuthHeader({
                url: endpoint,
                method: 'POST',
                data: {
                    oauth_callback: callbackUrl
                }
            }),
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body
    });

    const rawText = await response.text();
    if (!response.ok) {
        throw new Error(rawText || 'Falha ao iniciar a autorizacao com o X.');
    }

    const data = Object.fromEntries(new URLSearchParams(rawText));
    if (!data.oauth_token || !data.oauth_token_secret) {
        throw new Error('O X nao retornou um request token valido.');
    }

    return data;
}

async function exchangeXAccessToken(requestToken, requestTokenSecret, verifier) {
    const endpoint = 'https://api.x.com/oauth/access_token';
    const formData = {
        oauth_verifier: verifier
    };

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            authorization: buildXOAuthHeader({
                url: endpoint,
                method: 'POST',
                data: formData,
                token: {
                    key: requestToken,
                    secret: requestTokenSecret
                }
            }),
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: new URLSearchParams(formData).toString()
    });

    const rawText = await response.text();
    if (!response.ok) {
        throw new Error(rawText || 'Falha ao concluir a autorizacao com o X.');
    }

    return Object.fromEntries(new URLSearchParams(rawText));
}

export async function startPlatformAuth(client, state, platformKey, request) {
    const definition = getPlatformDefinition(platformKey);
    const origin = getRequestOrigin(request);
    const envStatus = getPlatformEnvStatus(platformKey);

    if (!definition) {
        throw new Error('Plataforma invalida.');
    }

    if (!envStatus.ready) {
        throw new Error(`Configure ${envStatus.missing.join(', ')} antes de conectar ${definition.label}.`);
    }

    const now = new Date();
    const expiresAt = new Date(Date.now() + 15 * 60 * 1000).toISOString();

    if (platformKey === 'x') {
        const requestToken = await requestXRequestToken(origin);
        const session = {
            id: crypto.randomUUID(),
            platformKey,
            requestToken: requestToken.oauth_token,
            requestTokenSecret: requestToken.oauth_token_secret,
            createdAt: now.toISOString(),
            expiresAt
        };

        await persistAuthSession(client, normalizeState(state), session);

        return redirect(`https://api.x.com/oauth/authenticate?oauth_token=${encodeURIComponent(requestToken.oauth_token)}`);
    }

    const session = {
        id: crypto.randomUUID(),
        platformKey,
        requestToken: '',
        requestTokenSecret: '',
        createdAt: now.toISOString(),
        expiresAt
    };

    await persistAuthSession(client, normalizeState(state), session);

    const builderMap = {
        youtube: buildYoutubeAuthUrl,
        tiktok: buildTikTokAuthUrl,
        threads: buildThreadsAuthUrl,
        instagram: buildInstagramAuthUrl
    };

    const authUrl = builderMap[platformKey](origin, session.id);
    return redirect(authUrl);
}

export async function finishPlatformAuth(client, state, request) {
    const url = new URL(request.url);
    const platformKey = url.searchParams.get('platform') || '';
    const definition = getPlatformDefinition(platformKey);
    const origin = getRequestOrigin(request);

    if (!definition) {
        return redirect(buildAdminProfilesUrl(origin, {
            social_status: 'error',
            social_message: 'Plataforma invalida para callback.'
        }));
    }

    if (url.searchParams.get('error')) {
        return redirect(buildAdminProfilesUrl(origin, {
            social_status: 'error',
            social_platform: platformKey,
            social_message: url.searchParams.get('error_description') || url.searchParams.get('error')
        }));
    }

    let workingState = normalizeState(state);
    let sessionInfo = null;

    if (platformKey === 'x') {
        const oauthToken = url.searchParams.get('oauth_token') || '';
        const { state: nextState, session } = consumeAuthSession(workingState, (entry) => entry.requestToken === oauthToken);
        workingState = nextState;
        sessionInfo = session;

        if (!sessionInfo) {
            return redirect(buildAdminProfilesUrl(origin, {
                social_status: 'error',
                social_platform: platformKey,
                social_message: 'A sessao de autorizacao do X expirou. Tente novamente.'
            }));
        }

        const verifier = url.searchParams.get('oauth_verifier') || '';
        const tokenData = await exchangeXAccessToken(sessionInfo.requestToken, sessionInfo.requestTokenSecret, verifier);

        workingState.platforms[platformKey] = {
            ...workingState.platforms[platformKey],
            connected: true,
            accountId: tokenData.user_id || '',
            handle: tokenData.screen_name ? `@${tokenData.screen_name}` : 'Conta X',
            avatarUrl: '',
            profileUrl: tokenData.screen_name ? `https://x.com/${tokenData.screen_name}` : '',
            accessToken: tokenData.oauth_token || '',
            refreshToken: '',
            tokenSecret: tokenData.oauth_token_secret || '',
            accessTokenExpiresAt: null,
            refreshTokenExpiresAt: null,
            scopes: [],
            metadata: {},
            updatedAt: new Date().toISOString(),
            lastError: ''
        };

        await writeState(client, workingState);

        return redirect(buildAdminProfilesUrl(origin, {
            social_status: 'connected',
            social_platform: platformKey,
            social_message: `${definition.label} conectado com sucesso.`
        }));
    }

    const stateId = url.searchParams.get('state') || '';
    const { state: nextState, session } = consumeAuthSession(workingState, (entry) => entry.id === stateId);
    workingState = nextState;
    sessionInfo = session;

    if (!sessionInfo) {
        return redirect(buildAdminProfilesUrl(origin, {
            social_status: 'error',
            social_platform: platformKey,
            social_message: `A sessao de autorizacao do ${definition.label} expirou.`
        }));
    }

    const code = url.searchParams.get('code') || '';
    let platformData = {};

    if (platformKey === 'youtube') {
        const tokenData = await requestYoutubeTokens(origin, code);
        const profile = await fetchYoutubeProfile(tokenData.access_token);
        platformData = {
            connected: true,
            ...profile,
            accessToken: tokenData.access_token || '',
            refreshToken: tokenData.refresh_token || workingState.platforms[platformKey].refreshToken,
            tokenSecret: '',
            accessTokenExpiresAt: buildExpiryDate(tokenData.expires_in),
            refreshTokenExpiresAt: null,
            scopes: String(tokenData.scope || '').split(/\s+/).filter(Boolean),
            metadata: {},
            updatedAt: new Date().toISOString(),
            lastError: ''
        };
    }

    if (platformKey === 'tiktok') {
        const tokenData = await requestTikTokTokens(origin, code);
        const profile = await fetchTikTokProfile(tokenData.access_token);
        platformData = {
            connected: true,
            ...profile,
            accessToken: tokenData.access_token || '',
            refreshToken: tokenData.refresh_token || '',
            tokenSecret: '',
            accessTokenExpiresAt: buildExpiryDate(tokenData.expires_in),
            refreshTokenExpiresAt: buildExpiryDate(tokenData.refresh_expires_in),
            scopes: String(tokenData.scope || '').split(',').map((scope) => scope.trim()).filter(Boolean),
            updatedAt: new Date().toISOString(),
            lastError: ''
        };
    }

    if (platformKey === 'threads') {
        const tokenData = await requestThreadsTokens(origin, code);
        const profile = await fetchThreadsProfile(tokenData.access_token);
        platformData = {
            connected: true,
            ...profile,
            accessToken: tokenData.access_token || '',
            refreshToken: '',
            tokenSecret: '',
            accessTokenExpiresAt: buildExpiryDate(tokenData.expires_in),
            refreshTokenExpiresAt: null,
            scopes: getPlatformDefinition(platformKey).scopes,
            metadata: {
                shortUserId: tokenData.short_user_id || ''
            },
            updatedAt: new Date().toISOString(),
            lastError: ''
        };
    }

    if (platformKey === 'instagram') {
        const tokenData = await requestInstagramTokens(origin, code);
        const profile = await fetchInstagramProfile(tokenData.access_token);
        platformData = {
            connected: true,
            ...profile,
            accessToken: tokenData.access_token || '',
            refreshToken: '',
            tokenSecret: '',
            accessTokenExpiresAt: buildExpiryDate(tokenData.expires_in),
            refreshTokenExpiresAt: null,
            scopes: getPlatformDefinition(platformKey).scopes,
            metadata: {
                shortUserId: tokenData.short_user_id || ''
            },
            updatedAt: new Date().toISOString(),
            lastError: ''
        };
    }

    workingState.platforms[platformKey] = {
        ...workingState.platforms[platformKey],
        ...platformData
    };

    await writeState(client, workingState);

    return redirect(buildAdminProfilesUrl(origin, {
        social_status: 'connected',
        social_platform: platformKey,
        social_message: `${definition.label} conectado com sucesso.`
    }));
}

export async function ensureFreshPlatformAccess(client, state, platformKey) {
    let workingState = normalizeState(state);
    const platform = workingState.platforms[platformKey];

    if (!platform?.connected || !platform.accessToken) {
        return {
            state: workingState,
            platform
        };
    }

    const expiresAt = platform.accessTokenExpiresAt ? Date.parse(platform.accessTokenExpiresAt) : null;
    const shouldRefresh = expiresAt && expiresAt < Date.now() + 2 * 60 * 1000;

    if (!shouldRefresh) {
        return {
            state: workingState,
            platform
        };
    }

    let nextPlatform = { ...platform };

    if (platformKey === 'youtube' && platform.refreshToken) {
        const env = getPlatformEnvStatus('youtube').values;
        const response = await fetch('https://oauth2.googleapis.com/token', {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body: new URLSearchParams({
                client_id: env.YOUTUBE_CLIENT_ID,
                client_secret: env.YOUTUBE_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: platform.refreshToken
            })
        });

        const tokenData = await readJsonResponse(response, 'Falha ao renovar o token do YouTube.');
        nextPlatform.accessToken = tokenData.access_token || platform.accessToken;
        nextPlatform.accessTokenExpiresAt = buildExpiryDate(tokenData.expires_in);
    }

    if (platformKey === 'tiktok' && platform.refreshToken) {
        const env = getPlatformEnvStatus('tiktok').values;
        const response = await fetch('https://open.tiktokapis.com/v2/oauth/token/', {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body: new URLSearchParams({
                client_key: env.TIKTOK_CLIENT_KEY,
                client_secret: env.TIKTOK_CLIENT_SECRET,
                grant_type: 'refresh_token',
                refresh_token: platform.refreshToken
            })
        });

        const tokenData = await readJsonResponse(response, 'Falha ao renovar o token do TikTok.');
        nextPlatform.accessToken = tokenData.access_token || platform.accessToken;
        nextPlatform.refreshToken = tokenData.refresh_token || platform.refreshToken;
        nextPlatform.accessTokenExpiresAt = buildExpiryDate(tokenData.expires_in);
        nextPlatform.refreshTokenExpiresAt = buildExpiryDate(tokenData.refresh_expires_in);
    }

    if (platformKey === 'threads') {
        const refreshUrl = new URL('https://graph.threads.net/refresh_access_token');
        refreshUrl.searchParams.set('grant_type', 'th_refresh_token');
        refreshUrl.searchParams.set('access_token', platform.accessToken);

        const response = await fetch(refreshUrl);
        const tokenData = await readJsonResponse(response, 'Falha ao renovar o token do Threads.');
        nextPlatform.accessToken = tokenData.access_token || platform.accessToken;
        nextPlatform.accessTokenExpiresAt = buildExpiryDate(tokenData.expires_in);
    }

    if (platformKey === 'instagram') {
        const refreshUrl = new URL('https://graph.instagram.com/refresh_access_token');
        refreshUrl.searchParams.set('grant_type', 'ig_refresh_token');
        refreshUrl.searchParams.set('access_token', platform.accessToken);

        const response = await fetch(refreshUrl);
        const tokenData = await readJsonResponse(response, 'Falha ao renovar o token do Instagram.');
        nextPlatform.accessToken = tokenData.access_token || platform.accessToken;
        nextPlatform.accessTokenExpiresAt = buildExpiryDate(tokenData.expires_in);
    }

    nextPlatform.updatedAt = new Date().toISOString();
    workingState.platforms[platformKey] = nextPlatform;
    workingState = await writeState(client, workingState);

    return {
        state: workingState,
        platform: nextPlatform
    };
}

export async function handleAuthRoute(request, client, state) {
    const url = new URL(request.url);
    const mode = url.searchParams.get('mode') || 'start';
    const platformKey = url.searchParams.get('platform') || '';

    if (mode === 'start') {
        return startPlatformAuth(client, state, platformKey, request);
    }

    if (mode === 'callback') {
        return finishPlatformAuth(client, state, request);
    }

    const origin = getRequestOrigin(request);
    return redirect(buildAdminProfilesUrl(origin, {
        social_status: 'error',
        social_message: truncate('Modo de autenticacao invalido.', 240)
    }));
}
