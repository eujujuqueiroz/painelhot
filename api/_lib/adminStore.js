import { ensureBucket, getBucketName } from './socialHub.js';

const ADMIN_STATE_PATH = 'system/admin-state.json';
const ADMIN_STATE_VERSION = 1;

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

function normalizePlan(plan = {}) {
    return {
        id: typeof plan.id === 'string' && plan.id ? plan.id : crypto.randomUUID(),
        name: typeof plan.name === 'string' ? plan.name.trim() : '',
        price: typeof plan.price === 'string' ? plan.price.trim() : '',
        priceCents: Number.isFinite(Number(plan.priceCents))
            ? Number(plan.priceCents)
            : currencyToCents(plan.price)
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
        displayName: typeof profile.displayName === 'string' ? profile.displayName.trim() : '',
        bio: typeof profile.bio === 'string' ? profile.bio.trim() : '',
        monthlyPrice: typeof profile.monthlyPrice === 'string' ? profile.monthlyPrice.trim() : ''
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
        plans: [
            { id: '1-month', name: '', price: '', priceCents: 0 },
            { id: '3-month', name: '', price: '', priceCents: 0 },
            { id: '6-month', name: '', price: '', priceCents: 0 }
        ],
        subscribers: [],
        metrics: normalizeMetrics()
    };
}

export function normalizeAdminState(rawState = {}) {
    const baseState = buildDefaultAdminState();
    const rawPlans = Array.isArray(rawState.plans) && rawState.plans.length
        ? rawState.plans
        : baseState.plans;

    return {
        version: ADMIN_STATE_VERSION,
        updatedAt: typeof rawState.updatedAt === 'string' ? rawState.updatedAt : null,
        profile: normalizeProfile(rawState.profile || baseState.profile),
        plans: rawPlans.map(normalizePlan),
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

export function toAdminClientState(state) {
    const normalizedState = normalizeAdminState(state);

    return {
        updatedAt: normalizedState.updatedAt,
        profile: normalizedState.profile,
        plans: normalizedState.plans,
        subscribers: normalizedState.subscribers,
        metrics: normalizedState.metrics,
        dashboard: buildDashboard(normalizedState)
    };
}
