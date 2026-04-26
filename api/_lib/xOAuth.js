import crypto from 'node:crypto';
import OAuth from 'oauth-1.0a';

function getXConsumerCredentials() {
    const key = (process.env.X_API_KEY || '').trim();
    const secret = (process.env.X_API_SECRET || '').trim();

    if (!key || !secret) {
        const missing = [];
        if (!key) {
            missing.push('X_API_KEY');
        }
        if (!secret) {
            missing.push('X_API_SECRET');
        }
        throw new Error(`Configuracao ausente: ${missing.join(', ')}`);
    }

    return { key, secret };
}

function createOAuthClient() {
    const consumer = getXConsumerCredentials();

    return new OAuth({
        consumer,
        signature_method: 'HMAC-SHA1',
        hash_function(baseString, signingKey) {
            return crypto.createHmac('sha1', signingKey).update(baseString).digest('base64');
        }
    });
}

export function buildXOAuthHeader({ url, method = 'GET', data, token }) {
    const oauth = createOAuthClient();
    const authData = oauth.authorize(
        { url, method, data },
        token ? { key: token.key, secret: token.secret } : undefined
    );

    return oauth.toHeader(authData).Authorization;
}
