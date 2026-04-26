import { ensureBucket, getBucketName } from './socialHub.js';

const ADMIN_STATE_PATH = 'system/admin-state.json';
const ADMIN_STATE_VERSION = 1;
const DEFAULT_PROFILE = {
    displayName: 'eujujuqueiroz',
    bio: 'A melhor ninfeta do privacy, venha me ver da melhor forma, novinha, magrinha, natural e ruiva e especialista em squirting \u2764\uFE0F\uD83D\uDD25',
    monthlyPrice: '40,00',
    avatarPath: '',
    coverPath: '',
    avatarUrl: 'perfil.jpg',
    coverUrl: 'banner.jpg'
};
const DEFAULT_PLANS = [
    { id: '1-month', name: '1 m\u00EAs', price: '40,00' },
    { id: '3-month', name: '3 meses', price: '120,00' },
    { id: '6-month', name: '6 meses', price: '240,00' }
];

function textOrFallback(value, fallback = '') {
    const text = typeof value === 'string' ? value.trim() : '';
    return text || fallback;
}

function normalizeCurrencyText(value) {
    return String(value || '')
        .replace(/[^\d,.-]/g, '')
        .replace(/\./g, '')
        .replace(',', '.')
        .trim();
}

function currencyToCents(value) {
    const parsed = Number(normalizeCurrencyText(value));
    return Number.isFinite(parsed) ? Math.round(parsed * 100) : 0;
}

function centsToCurrency(cents) {
    return new Intl.NumberFormat('pt-BR', {
        style: 'currency',
        currency: 'BRL'
    }).format((Number(cents) || 0) / 100);
}

function normalizePlan(plan = {}, fallback = {}) {
    const price = textOrFallback(plan.price, fallback.price || '');

    return {
        id: textOrFallback(plan.id, fallback.id || crypto.randomUUID()),
        name: textOrFallback(plan.name, fallback.name || ''),
        price,
        priceCents: price
            ? currencyToCents(price)
            : Number.isFinite(Number(plan.priceCents)) ? Number(plan.priceCents) : 0
    };
}

function normalizeSubscriber(subscriber = {}) {
    const status = typeof subscriber.status === 'string' ? subscriber.status : 'active';

    return {
        id: typeof subscriber.id === 'string' && subscriber.id ? subscriber.id : crypto.randomUUID(),
        name: typeof subscriber.name === 'string' ? subscriber.name.trim() : '',
        email: typeof subscriber.email === 'string' ? subscriber.email.trim() : '',
        avatarUrl: typeof subscriber.avatarUrl === 'string' ? subscriber.avatarUrl.trim() : '',
        planId: typeof subscriber.planId === 'string' ? subscriber.planId.trim() : '',
        planName: typeof subscriber.planName === 'string' ? subscriber.planName.trim() : '',
        amountCents: Number.isFinite(Number(subscriber.amountCents)) ? Number(subscriber.amountCents) : 0,
        status: ['active', 'inactive', 'pending', 'cancelled'].includes(status) ? status : 'active',
        createdAt: typeof subscriber.createdAt === 'string' ? subscriber.createdAt : new Date().toISOString()
    };
}

function normalizeProfile(profile = {}) {
    return {
        displayName: textOrFallback(profile.displayName, DEFAULT_PROFILE.displayName),
        bio: textOrFallback(profile.bio, DEFAULT_PROFILE.bio),
        monthlyPrice: textOrFallback(profile.monthlyPrice, DEFAULT_PROFILE.monthlyPrice),
        avatarPath: typeof profile.avatarPath === 'string' ? profile.avatarPath.trim() : DEFAULT_PROFILE.avatarPath,
        coverPath: typeof profile.coverPath === 'string' ? profile.coverPath.trim() : DEFAULT_PROFILE.coverPath,
        avatarUrl: textOrFallback(profile.avatarUrl, DEFAULT_PROFILE.avatarUrl),
        coverUrl: textOrFallback(profile.coverUrl, DEFAULT_PROFILE.coverUrl)
    };
}

function normalizeMetrics(metrics = {}) {
    return {
        profileViews: Number.isFinite(Number(metrics.profileViews)) ? Number(metrics.profileViews) : 0,
        profileViewsDelta24h: Number.isFinite(Number(metrics.profileViewsDelta24h)) ? Number(metrics.profileViewsDelta24h) : 0
    };
}

export function buildDefaultAdminState() {
    return {
        version: ADMIN_STATE_VERSION,
        updatedAt: null,
        profile: normalizeProfile(),
        plans: DEFAULT_PLANS.map((plan) => normalizePlan(plan)),
        subscribers: [],
        metrics: normalizeMetrics()
    };
}

export function normalizeAdminState(rawState = {}) {
    const baseState = buildDefaultAdminState();
    const rawPlans = Array.isArray(rawState.plans) ? rawState.plans : [];
    const defaultPlanIds = new Set(baseState.plans.map((plan) => plan.id));
    const plans = [
        ...baseState.plans.map((defaultPlan) => normalizePlan(
            rawPlans.find((plan) => plan?.id === defaultPlan.id) || {},
            defaultPlan
        )),
        ...rawPlans
            .filter((plan) => plan?.id && !defaultPlanIds.has(plan.id))
            .map((plan) => normalizePlan(plan))
    ];

    return {
        version: ADMIN_STATE_VERSION,
        updatedAt: typeof rawState.updatedAt === 'string' ? rawState.updatedAt : null,
        profile: normalizeProfile(rawState.profile || baseState.profile),
        plans,
        subscribers: Array.isArray(rawState.subscribers) ? rawState.subscribers.map(normalizeSubscriber) : [],
        metrics: normalizeMetrics(rawState.metrics)
    };
}

function isNotFoundError(error) {
    const message = `${error?.message || ''}`.toLowerCase();
    return error?.statusCode === 404
        || error?.status === 404
        || message.includes('not found')
        || message.includes('no such object');
}

export async function readAdminState(client) {
    await ensureBucket(client);

    const { data, error } = await client.storage.from(getBucketName()).download(ADMIN_STATE_PATH);
    if (error) {
        if (isNotFoundError(error)) {
            return buildDefaultAdminState();
        }
        throw error;
    }

    const rawText = await data.text();
    if (!rawText.trim()) {
        return buildDefaultAdminState();
    }

    return normalizeAdminState(JSON.parse(rawText));
}

export async function writeAdminState(client, nextState) {
    const normalizedState = normalizeAdminState({
        ...nextState,
        updatedAt: new Date().toISOString()
    });

    const { error } = await client.storage.from(getBucketName()).upload(
        ADMIN_STATE_PATH,
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

export function buildDashboard(state) {
    const normalizedState = normalizeAdminState(state);
    const activeSubscribers = normalizedState.subscribers.filter((subscriber) => subscriber.status === 'active');
    const totalRevenueCents = activeSubscribers.reduce((sum, subscriber) => sum + subscriber.amountCents, 0);
    const recentSubscribers = [...normalizedState.subscribers]
        .sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))
        .slice(0, 5);

    return {
        totalRevenue: centsToCurrency(totalRevenueCents),
        activeSubscribers: activeSubscribers.length,
        profileViews: normalizedState.metrics.profileViews,
        profileViewsDelta24h: normalizedState.metrics.profileViewsDelta24h,
        recentSubscribers
    };
}

async function getSignedMediaUrl(client, path, fallbackUrl) {
    if (!client || !path) {
        return fallbackUrl;
    }

    const { data, error } = await client.storage
        .from(getBucketName())
        .createSignedUrl(path, 60 * 60 * 24 * 7);

    if (error || !data?.signedUrl) {
        return fallbackUrl;
    }

    return data.signedUrl;
}

export async function toAdminClientState(state, client = null) {
    const normalizedState = normalizeAdminState(state);
    const profile = {
        ...normalizedState.profile,
        avatarUrl: await getSignedMediaUrl(
            client,
            normalizedState.profile.avatarPath,
            normalizedState.profile.avatarUrl
        ),
        coverUrl: await getSignedMediaUrl(
            client,
            normalizedState.profile.coverPath,
            normalizedState.profile.coverUrl
        )
    };

    return {
        updatedAt: normalizedState.updatedAt,
        profile,
        plans: normalizedState.plans,
        subscribers: normalizedState.subscribers,
        metrics: normalizedState.metrics,
        dashboard: buildDashboard(normalizedState)
    };
}
