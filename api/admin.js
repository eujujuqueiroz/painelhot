import { createSupabaseAdminClient, getBucketName, sanitizeFilename } from './_lib/socialHub.js';
import {
    readAdminState,
    toAdminClientState,
    writeAdminState
} from './_lib/adminStore.js';

const NO_STORE_HEADERS = {
    'cache-control': 'no-store, no-cache, must-revalidate, max-age=0',
    pragma: 'no-cache',
    expires: '0'
};

function json(data, init = {}) {
    const headers = new Headers(init.headers || {});

    Object.entries(NO_STORE_HEADERS).forEach(([key, value]) => {
        if (!headers.has(key)) {
            headers.set(key, value);
        }
    });

    return Response.json(data, {
        ...init,
        headers
    });
}

function errorJson(message, status = 500, details = null) {
    return json(
        {
            ok: false,
            error: message,
            ...(details ? { details } : {})
        },
        { status }
    );
}

function normalizePlanInput(plan = {}) {
    return {
        id: typeof plan.id === 'string' ? plan.id : '',
        name: typeof plan.name === 'string' ? plan.name : '',
        price: typeof plan.price === 'string' ? plan.price : ''
    };
}

function getRequestContentType(request) {
    return request.headers.get('content-type') || '';
}

function buildProfileMediaPath(mediaType, filename) {
    const now = new Date();
    const year = now.getUTCFullYear();
    const month = String(now.getUTCMonth() + 1).padStart(2, '0');
    return `profile/${mediaType}/${year}/${month}/${crypto.randomUUID()}-${sanitizeFilename(filename || `${mediaType}.jpg`)}`;
}

async function parseAdminRequestBody(request) {
    const contentType = getRequestContentType(request).toLowerCase();
    if (contentType.includes('multipart/form-data')) {
        const formData = await request.formData();
        return {
            action: String(formData.get('action') || ''),
            formData
        };
    }

    return request.json();
}

export async function GET() {
    try {
        const client = createSupabaseAdminClient();
        const state = await readAdminState(client);

        return json({
            ok: true,
            state: await toAdminClientState(state, client)
        });
    } catch (error) {
        return errorJson(
            'Nao foi possivel carregar os dados administrativos reais.',
            500,
            `${error?.message || error}`
        );
    }
}

export async function POST(request) {
    let body = {};

    try {
        body = await parseAdminRequestBody(request);
    } catch (error) {
        return errorJson('Payload invalido.', 400);
    }

    const action = typeof body.action === 'string' ? body.action : '';

    try {
        const client = createSupabaseAdminClient();
        let state = await readAdminState(client);

        if (action === 'save-profile') {
            state.profile = {
                ...state.profile,
                displayName: typeof body.profile?.displayName === 'string' ? body.profile.displayName : '',
                bio: typeof body.profile?.bio === 'string' ? body.profile.bio : '',
                monthlyPrice: typeof body.profile?.monthlyPrice === 'string' ? body.profile.monthlyPrice : ''
            };
            state.plans = state.plans.map((plan) => plan.id === '1-month'
                ? { ...plan, price: state.profile.monthlyPrice }
                : plan
            );

            state = await writeAdminState(client, state);
            return json({
                ok: true,
                message: 'Perfil salvo em producao.',
                state: await toAdminClientState(state, client)
            });
        }

        if (action === 'upload-profile-media') {
            const mediaType = String(body.formData?.get('mediaType') || '');
            const file = body.formData?.get('file');

            if (!['avatar', 'cover'].includes(mediaType)) {
                return errorJson('Tipo de imagem invalido.', 400);
            }
            if (!file || typeof file.arrayBuffer !== 'function') {
                return errorJson('Envie uma imagem valida.', 400);
            }
            if (file.size > 8 * 1024 * 1024) {
                return errorJson('A imagem deve ter no maximo 8 MB.', 400);
            }
            if (file.type && !file.type.startsWith('image/')) {
                return errorJson('O arquivo precisa ser uma imagem.', 400);
            }

            const storagePath = buildProfileMediaPath(mediaType, file.name);
            const { error: uploadError } = await client.storage
                .from(getBucketName())
                .upload(
                    storagePath,
                    new Blob([await file.arrayBuffer()], { type: file.type || 'image/jpeg' }),
                    {
                        upsert: true,
                        contentType: file.type || 'image/jpeg'
                    }
                );

            if (uploadError) {
                throw uploadError;
            }

            state.profile = {
                ...state.profile,
                ...(mediaType === 'avatar' ? { avatarPath: storagePath } : { coverPath: storagePath })
            };
            state = await writeAdminState(client, state);

            return json({
                ok: true,
                message: mediaType === 'avatar'
                    ? 'Foto de perfil salva em producao.'
                    : 'Banner salvo em producao.',
                state: await toAdminClientState(state, client)
            });
        }

        if (action === 'save-plans') {
            const plans = Array.isArray(body.plans) ? body.plans.map(normalizePlanInput) : [];
            if (!plans.length) {
                return errorJson('Informe ao menos um plano.', 400);
            }

            state.plans = plans;
            const monthlyPlan = plans.find((plan) => plan.id === '1-month');
            if (monthlyPlan?.price) {
                state.profile = {
                    ...state.profile,
                    monthlyPrice: monthlyPlan.price
                };
            }
            state = await writeAdminState(client, state);
            return json({
                ok: true,
                message: 'Planos salvos em producao.',
                state: await toAdminClientState(state, client)
            });
        }

        return errorJson('Acao administrativa invalida.', 400);
    } catch (error) {
        return errorJson(
            'Nao foi possivel salvar os dados administrativos.',
            500,
            `${error?.message || error}`
        );
    }
}
