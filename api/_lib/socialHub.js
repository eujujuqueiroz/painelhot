import { createClient } from '@supabase/supabase-js';
import {
    buildPlatformCallbackUrl,
    buildPlatformConnectUrl,
    getAuthFlowLabel,
    getPlatformDefinition,
    getPlatformEnvStatus,
    getPlatformKeys,
    getPublishModeLabel
} from './platformCatalog.js';

const BUCKET_NAME = process.env.SOCIAL_HUB_BUCKET || 'social-hub';
const STATE_PATH = 'system/social-state.json';
const STATE_VERSION = 2;

function getSupabaseUrl() {
    return process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL || '';
}

function getSupabaseAnonKey() {
    return process.env.SUPABASE_ANON_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || '';
}

function getSupabaseServiceRoleKey() {
    return process.env.SUPABASE_SERVICE_ROLE_KEY || '';
}

function buildDefaultPlatform(key) {
    const definition = getPlatformDefinition(key);
    return {
        key,
        label: definition.label,
        connected: false,
        handle: '',
        accountId: '',
        avatarUrl: '',
        profileUrl: '',
        accessToken: '',
        refreshToken: '',
        tokenSecret: '',
        accessTokenExpiresAt: null,
        refreshTokenExpiresAt: null,
        scopes: [],
        metadata: {},
        updatedAt: null,
        lastError: ''
    };
}

export function buildDefaultState() {
    return {
        version: STATE_VERSION,
        updatedAt: null,
        lastRunAt: null,
        platforms: Object.fromEntries(
            getPlatformKeys().map((platformKey) => [
                platformKey,
                buildDefaultPlatform(platformKey)
            ])
        ),
        authSessions: [],
        queue: [],
        logs: []
    };
}

function normalizePlatformState(platforms = {}) {
    return Object.fromEntries(
        getPlatformKeys().map((platformKey) => {
            const input = platforms[platformKey] || {};
            const platform = {
                ...buildDefaultPlatform(platformKey),
                ...input,
                key: platformKey,
                label: getPlatformDefinition(platformKey).label
            };

            platform.handle = typeof platform.handle === 'string' ? platform.handle.trim() : '';
            platform.accountId = typeof platform.accountId === 'string' ? platform.accountId.trim() : '';
            platform.avatarUrl = typeof platform.avatarUrl === 'string' ? platform.avatarUrl.trim() : '';
            platform.profileUrl = typeof platform.profileUrl === 'string' ? platform.profileUrl.trim() : '';
            platform.accessToken = typeof platform.accessToken === 'string' ? platform.accessToken.trim() : '';
            platform.refreshToken = typeof platform.refreshToken === 'string' ? platform.refreshToken.trim() : '';
            platform.tokenSecret = typeof platform.tokenSecret === 'string' ? platform.tokenSecret.trim() : '';
            platform.accessTokenExpiresAt = typeof platform.accessTokenExpiresAt === 'string' ? platform.accessTokenExpiresAt : null;
            platform.refreshTokenExpiresAt = typeof platform.refreshTokenExpiresAt === 'string' ? platform.refreshTokenExpiresAt : null;
            platform.scopes = Array.isArray(platform.scopes)
                ? [...new Set(platform.scopes.map((scope) => String(scope)))]
                : [];
            platform.metadata = platform.metadata && typeof platform.metadata === 'object' && !Array.isArray(platform.metadata)
                ? platform.metadata
                : {};
            platform.updatedAt = typeof platform.updatedAt === 'string' ? platform.updatedAt : null;
            platform.lastError = typeof platform.lastError === 'string' ? platform.lastError : '';
            platform.connected = Boolean(platform.connected && platform.accessToken);

            return [platformKey, platform];
        })
    );
}

function cleanPlatformList(value) {
    if (!Array.isArray(value)) {
        return [];
    }

    return [...new Set(
        value
            .filter((platformKey) => Object.prototype.hasOwnProperty.call(buildDefaultState().platforms, platformKey))
            .map((platformKey) => String(platformKey))
    )];
}

function normalizeVideo(video = {}) {
    const allowedStatuses = new Set(['uploading', 'ready', 'publishing', 'partial', 'done', 'failed']);
    return {
        id: typeof video.id === 'string' && video.id ? video.id : crypto.randomUUID(),
        name: typeof video.name === 'string' && video.name ? video.name : 'video.mp4',
        size: Number.isFinite(Number(video.size)) ? Number(video.size) : 0,
        type: typeof video.type === 'string' && video.type ? video.type : 'video/mp4',
        storagePath: typeof video.storagePath === 'string' ? video.storagePath : '',
        status: allowedStatuses.has(video.status) ? video.status : 'ready',
        createdAt: typeof video.createdAt === 'string' ? video.createdAt : new Date().toISOString(),
        uploadedAt: typeof video.uploadedAt === 'string' ? video.uploadedAt : null,
        lastError: typeof video.lastError === 'string' ? video.lastError : '',
        pendingPlatforms: cleanPlatformList(video.pendingPlatforms),
        sentPlatforms: cleanPlatformList(video.sentPlatforms)
    };
}

function normalizeLog(log = {}) {
    const allowedStatuses = new Set(['done', 'failed', 'partial']);

    return {
        id: typeof log.id === 'string' && log.id ? log.id : crypto.randomUUID(),
        title: typeof log.title === 'string' ? log.title : 'Disparo social',
        summary: typeof log.summary === 'string' ? log.summary : '',
        createdAt: typeof log.createdAt === 'string' ? log.createdAt : new Date().toISOString(),
        deliveries: Array.isArray(log.deliveries)
            ? log.deliveries.map((delivery) => ({
                platformKey: typeof delivery.platformKey === 'string' ? delivery.platformKey : '',
                status: allowedStatuses.has(delivery.status) ? delivery.status : 'done',
                videoCount: Number.isFinite(Number(delivery.videoCount)) ? Number(delivery.videoCount) : 0,
                successCount: Number.isFinite(Number(delivery.successCount)) ? Number(delivery.successCount) : 0,
                failedCount: Number.isFinite(Number(delivery.failedCount)) ? Number(delivery.failedCount) : 0,
                message: typeof delivery.message === 'string' ? delivery.message : ''
            }))
            : []
    };
}

function normalizeAuthSessions(authSessions = []) {
    const now = Date.now();

    return (Array.isArray(authSessions) ? authSessions : [])
        .map((session) => ({
            id: typeof session.id === 'string' ? session.id : crypto.randomUUID(),
            platformKey: typeof session.platformKey === 'string' ? session.platformKey : '',
            requestToken: typeof session.requestToken === 'string' ? session.requestToken : '',
            requestTokenSecret: typeof session.requestTokenSecret === 'string' ? session.requestTokenSecret : '',
            createdAt: typeof session.createdAt === 'string' ? session.createdAt : new Date().toISOString(),
            expiresAt: typeof session.expiresAt === 'string'
                ? session.expiresAt
                : new Date(now + 15 * 60 * 1000).toISOString()
        }))
        .filter((session) => session.platformKey && Date.parse(session.expiresAt) > now);
}

export function normalizeState(rawState = {}) {
    const baseState = buildDefaultState();

    return {
        version: STATE_VERSION,
        updatedAt: typeof rawState.updatedAt === 'string' ? rawState.updatedAt : baseState.updatedAt,
        lastRunAt: typeof rawState.lastRunAt === 'string' ? rawState.lastRunAt : baseState.lastRunAt,
        platforms: normalizePlatformState(rawState.platforms),
        authSessions: normalizeAuthSessions(rawState.authSessions),
        queue: Array.isArray(rawState.queue) ? rawState.queue.map(normalizeVideo) : [],
        logs: Array.isArray(rawState.logs) ? rawState.logs.map(normalizeLog).slice(0, 20) : []
    };
}

function isNotFoundError(error) {
    const message = `${error?.message || ''}`.toLowerCase();
    return error?.statusCode === 404
        || error?.status === 404
        || message.includes('not found')
        || message.includes('no such object');
}

export function getPublicClientConfig() {
    const url = getSupabaseUrl();
    const anonKey = getSupabaseAnonKey();

    if (!url || !anonKey) {
        return null;
    }

    return {
        url,
        anonKey,
        bucket: BUCKET_NAME
    };
}

export function createSupabaseAdminClient() {
    const url = getSupabaseUrl();
    const serviceRoleKey = getSupabaseServiceRoleKey();

    if (!url || !serviceRoleKey) {
        const missing = [];
        if (!url) {
            missing.push('SUPABASE_URL');
        }
        if (!serviceRoleKey) {
            missing.push('SUPABASE_SERVICE_ROLE_KEY');
        }
        throw new Error(`Configuracao ausente: ${missing.join(', ')}`);
    }

    return createClient(url, serviceRoleKey, {
        auth: {
            persistSession: false,
            autoRefreshToken: false,
            detectSessionInUrl: false
        }
    });
}

export async function ensureBucket(client) {
    const { data, error } = await client.storage.listBuckets();
    if (error) {
        throw error;
    }

    if (data.some((bucket) => bucket.id === BUCKET_NAME)) {
        return;
    }

    const { error: createError } = await client.storage.createBucket(BUCKET_NAME, {
        public: false
    });

    if (createError && !/already exists/i.test(createError.message || '')) {
        throw createError;
    }
}

export async function readState(client) {
    await ensureBucket(client);

    const { data, error } = await client.storage.from(BUCKET_NAME).download(STATE_PATH);
    if (error) {
        if (isNotFoundError(error)) {
            return buildDefaultState();
        }
        throw error;
    }

    const rawText = await data.text();
    if (!rawText.trim()) {
        return buildDefaultState();
    }

    return normalizeState(JSON.parse(rawText));
}

export async function writeState(client, nextState) {
    const normalizedState = normalizeState({
        ...nextState,
        updatedAt: new Date().toISOString()
    });

    const { error } = await client.storage.from(BUCKET_NAME).upload(
        STATE_PATH,
        new Blob([JSON.stringify(normalizedState, null, 2)], { type: 'application/json;charset=utf-8' }),
        {
            upsert: true,
            contentType: 'application/json'
        }
    );

    if (error) {
        throw error;
    }

    return normalizedState;
}

export function toClientState(state) {
    const normalizedState = normalizeState(state);

    return {
        updatedAt: normalizedState.updatedAt,
        lastRunAt: normalizedState.lastRunAt,
        supabase: getPublicClientConfig(),
        platforms: Object.fromEntries(
            Object.entries(normalizedState.platforms).map(([platformKey, platform]) => [
                platformKey,
                platform
            ])
        ),
        queue: normalizedState.queue,
        logs: normalizedState.logs
    };
}

export function toClientStateWithMeta(state, origin) {
    const normalizedState = normalizeState(state);

    return {
        updatedAt: normalizedState.updatedAt,
        lastRunAt: normalizedState.lastRunAt,
        supabase: getPublicClientConfig(),
        platforms: Object.fromEntries(
            Object.entries(normalizedState.platforms).map(([platformKey, platform]) => {
                const definition = getPlatformDefinition(platformKey);
                const envStatus = getPlatformEnvStatus(platformKey);

                return [platformKey, {
                    key: platformKey,
                    label: platform.label,
                    connected: platform.connected,
                    handle: platform.handle,
                    accountId: platform.accountId,
                    avatarUrl: platform.avatarUrl,
                    profileUrl: platform.profileUrl,
                    updatedAt: platform.updatedAt,
                    lastError: platform.lastError,
                    envReady: envStatus.ready,
                    missingEnvKeys: envStatus.missing,
                    authType: getAuthFlowLabel(platformKey),
                    publishMode: getPublishModeLabel(platformKey),
                    requirements: definition.requirements,
                    callbackUrl: buildPlatformCallbackUrl(origin, platformKey),
                    connectUrl: envStatus.ready ? buildPlatformConnectUrl(origin, platformKey) : '',
                    hasRefreshToken: Boolean(platform.refreshToken),
                    scopes: platform.scopes
                }];
            })
        ),
        queue: normalizedState.queue,
        logs: normalizedState.logs
    };
}

export function sanitizeFilename(filename) {
    const safeValue = String(filename || 'video.mp4')
        .normalize('NFD')
        .replace(/[\u0300-\u036f]/g, '')
        .replace(/[^a-zA-Z0-9._-]+/g, '-')
        .replace(/-{2,}/g, '-')
        .replace(/^-|-$/g, '');

    return safeValue || `video-${Date.now()}.mp4`;
}

export function buildVideoPath(filename, id) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `videos/${year}/${month}/${id}-${sanitizeFilename(filename)}`;
}

export function getBucketName() {
    return BUCKET_NAME;
}
