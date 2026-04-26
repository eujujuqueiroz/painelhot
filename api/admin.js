import { createSupabaseAdminClient } from './_lib/socialHub.js';
import {
    readAdminState,
    toAdminClientState,
    writeAdminState
} from './_lib/adminStore.js';

function json(data, init = {}) {
    return Response.json(data, init);
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

export async function GET() {
    try {
        const client = createSupabaseAdminClient();
        const state = await readAdminState(client);

        return json({
            ok: true,
            state: toAdminClientState(state)
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
        body = await request.json();
    } catch (error) {
        return errorJson('Payload invalido.', 400);
    }

    const action = typeof body.action === 'string' ? body.action : '';

    try {
        const client = createSupabaseAdminClient();
        let state = await readAdminState(client);

        if (action === 'save-profile') {
            state.profile = {
                displayName: typeof body.profile?.displayName === 'string' ? body.profile.displayName : '',
                bio: typeof body.profile?.bio === 'string' ? body.profile.bio : '',
                monthlyPrice: typeof body.profile?.monthlyPrice === 'string' ? body.profile.monthlyPrice : ''
            };

            state = await writeAdminState(client, state);
            return json({
                ok: true,
                message: 'Perfil salvo em producao.',
                state: toAdminClientState(state)
            });
        }

        if (action === 'save-plans') {
            const plans = Array.isArray(body.plans) ? body.plans.map(normalizePlanInput) : [];
            if (!plans.length) {
                return errorJson('Informe ao menos um plano.', 400);
            }

            state.plans = plans;
            state = await writeAdminState(client, state);
            return json({
                ok: true,
                message: 'Planos salvos em producao.',
                state: toAdminClientState(state)
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
