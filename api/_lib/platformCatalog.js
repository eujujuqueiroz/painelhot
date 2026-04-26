export const PLATFORM_DEFINITIONS = {
    instagram: {
        key: 'instagram',
        label: 'Instagram',
        authFlow: 'oauth2',
        publishMode: 'remote_url',
        envKeys: ['INSTAGRAM_CLIENT_ID', 'INSTAGRAM_CLIENT_SECRET'],
        scopes: ['instagram_business_basic', 'instagram_business_content_publish'],
        requirements: 'Conta profissional conectada a uma pagina do Facebook e permissao de content publishing no app.'
    },
    tiktok: {
        key: 'tiktok',
        label: 'TikTok',
        authFlow: 'oauth2',
        publishMode: 'native_upload',
        envKeys: ['TIKTOK_CLIENT_KEY', 'TIKTOK_CLIENT_SECRET'],
        scopes: ['user.info.basic', 'video.publish'],
        requirements: 'App com Login Kit e Content Posting API habilitados, incluindo aprovacao do escopo video.publish.'
    },
    youtube: {
        key: 'youtube',
        label: 'YouTube',
        authFlow: 'oauth2',
        publishMode: 'resumable_upload',
        envKeys: ['YOUTUBE_CLIENT_ID', 'YOUTUBE_CLIENT_SECRET'],
        scopes: [
            'https://www.googleapis.com/auth/youtube.upload',
            'https://www.googleapis.com/auth/youtube.readonly'
        ],
        requirements: 'Projeto com YouTube Data API v3 habilitada e credenciais OAuth do tipo Web application.'
    },
    x: {
        key: 'x',
        label: 'X',
        authFlow: 'oauth1a',
        publishMode: 'chunked_upload',
        envKeys: ['X_API_KEY', 'X_API_SECRET'],
        scopes: [],
        requirements: 'Projeto com Login with X e permissao de escrita; uploads de video usam OAuth 1.0a com user context.'
    },
    threads: {
        key: 'threads',
        label: 'Threads',
        authFlow: 'oauth2',
        publishMode: 'remote_url',
        envKeys: ['THREADS_CLIENT_ID', 'THREADS_CLIENT_SECRET'],
        scopes: ['threads_basic', 'threads_content_publish'],
        requirements: 'App Threads com scopes threads_basic e threads_content_publish liberados para a conta conectada.'
    }
};

export function getPlatformKeys() {
    return Object.keys(PLATFORM_DEFINITIONS);
}

export function getPlatformDefinition(platformKey) {
    return PLATFORM_DEFINITIONS[platformKey];
}

export function getPlatformEnvStatus(platformKey) {
    const definition = getPlatformDefinition(platformKey);
    if (!definition) {
        return {
            ready: false,
            missing: [],
            values: {}
        };
    }

    const values = {};
    const missing = [];

    definition.envKeys.forEach((envKey) => {
        const value = (process.env[envKey] || '').trim();
        values[envKey] = value;
        if (!value) {
            missing.push(envKey);
        }
    });

    return {
        ready: missing.length === 0,
        missing,
        values
    };
}

export function getRequestOrigin(request) {
    const override = (process.env.SOCIAL_HUB_PUBLIC_ORIGIN || '').trim().replace(/\/+$/, '');
    if (override) {
        return override;
    }

    const url = new URL(request.url);
    const proto = request.headers.get('x-forwarded-proto') || url.protocol.replace(':', '');
    const host = request.headers.get('x-forwarded-host') || request.headers.get('host') || url.host;
    return `${proto}://${host}`;
}

export function buildPlatformCallbackUrl(origin, platformKey) {
    const url = new URL('/api/social-auth', origin);
    url.searchParams.set('mode', 'callback');
    url.searchParams.set('platform', platformKey);
    return url.toString();
}

export function buildPlatformConnectUrl(origin, platformKey) {
    const url = new URL('/api/social-auth', origin);
    url.searchParams.set('mode', 'start');
    url.searchParams.set('platform', platformKey);
    return url.toString();
}

export function buildAdminProfilesUrl(origin, params = {}) {
    const url = new URL('/', origin);
    url.searchParams.set('admin_section', 'profiles');

    Object.entries(params).forEach(([key, value]) => {
        if (value !== undefined && value !== null && value !== '') {
            url.searchParams.set(key, String(value));
        }
    });

    return url.toString();
}

export function getPublishModeLabel(platformKey) {
    const definition = getPlatformDefinition(platformKey);
    if (!definition) {
        return '';
    }

    if (definition.publishMode === 'remote_url') {
        return 'URL assinada';
    }

    if (definition.publishMode === 'resumable_upload') {
        return 'Upload resumivel';
    }

    if (definition.publishMode === 'chunked_upload') {
        return 'Upload em partes';
    }

    return 'Upload nativo';
}

export function getAuthFlowLabel(platformKey) {
    const definition = getPlatformDefinition(platformKey);
    if (!definition) {
        return '';
    }

    return definition.authFlow === 'oauth1a' ? 'OAuth 1.0a' : 'OAuth 2.0';
}
