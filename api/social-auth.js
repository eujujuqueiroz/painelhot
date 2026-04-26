import { createSupabaseAdminClient, readState } from './_lib/socialHub.js';
import { handleAuthRoute } from './_lib/platformAuth.js';

export async function GET(request) {
    try {
        const client = createSupabaseAdminClient();
        const state = await readState(client);
        return handleAuthRoute(request, client, state);
    } catch (error) {
        return Response.json({
            ok: false,
            error: 'Nao foi possivel concluir a autenticacao social.',
            details: `${error?.message || error}`
        }, { status: 500 });
    }
}
