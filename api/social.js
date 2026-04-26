import {
    buildVideoPath,
    createSupabaseAdminClient,
    getBucketName,
    getPublicClientConfig,
    normalizeState,
    readState,
    toClientStateWithMeta,
    writeState
} from './_lib/socialHub.js';
import { ensureFreshPlatformAccess } from './_lib/platformAuth.js';
import { getPlatformDefinition, getRequestOrigin } from './_lib/platformCatalog.js';
import { publishVideosToPlatform } from './_lib/platformPublishers.js';

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

function getConnectedPlatforms(state) {
    return Object.entries(state.platforms)
        .filter(([, platform]) => platform.connected && platform.accessToken)
        .map(([key, platform]) => ({ key, ...platform }));
}

function getTargetPlatformsForVideo(video, connectedPlatformKeys) {
    if (Array.isArray(video.pendingPlatforms) && video.pendingPlatforms.length) {
        return video.pendingPlatforms.filter((platformKey) => connectedPlatformKeys.includes(platformKey));
    }

    if (Array.isArray(video.sentPlatforms) && video.sentPlatforms.length) {
        return connectedPlatformKeys.filter((platformKey) => !video.sentPlatforms.includes(platformKey));
    }

    return [...connectedPlatformKeys];
}

async function buildSignedUrlMap(client, paths) {
    const uniquePaths = [...new Set(paths.filter(Boolean))];
    const { data, error } = await client.storage
        .from(getBucketName())
        .createSignedUrls(uniquePaths, 60 * 60 * 24);

    if (error) {
        throw error;
    }

    const publicConfig = getPublicClientConfig();
    return Object.fromEntries(
        (data || []).map((entry) => {
            const signedUrl = entry.signedUrl && entry.signedUrl.startsWith('/')
                ? `${publicConfig?.url || ''}/storage/v1${entry.signedUrl}`
                : entry.signedUrl;

            return [entry.path, signedUrl];
        })
    );
}

export async function GET(request) {
    try {
        const client = createSupabaseAdminClient();
        const state = await readState(client);
        const origin = getRequestOrigin(request);

        return json({
            ok: true,
            state: toClientStateWithMeta(state, origin),
            storageReady: Boolean(getPublicClientConfig())
        });
    } catch (error) {
        return errorJson(
            'Nao foi possivel carregar a central de redes sociais.',
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
        let state = await readState(client);
        const origin = getRequestOrigin(request);

        if (action === 'disconnect-platform') {
            const platformKey = typeof body.platformKey === 'string' ? body.platformKey : '';
            const definition = getPlatformDefinition(platformKey);

            if (!definition) {
                return errorJson('Plataforma invalida.', 400);
            }

            state.platforms[platformKey] = {
                ...state.platforms[platformKey],
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
                updatedAt: new Date().toISOString(),
                lastError: ''
            };

            state = await writeState(client, state);

            return json({
                ok: true,
                message: `${definition.label} desconectado.`,
                state: toClientStateWithMeta(state, origin)
            });
        }

        if (action === 'prepare-upload') {
            const files = Array.isArray(body.files) ? body.files : [];
            if (!files.length) {
                return errorJson('Nenhum arquivo foi enviado para a fila.', 400);
            }

            const publicConfig = getPublicClientConfig();
            if (!publicConfig) {
                return errorJson('Faltam SUPABASE_URL e SUPABASE_ANON_KEY para receber uploads diretos.', 500);
            }

            const uploads = [];
            const now = new Date().toISOString();

            for (const file of files.slice(0, 50)) {
                const fileId = crypto.randomUUID();
                const storagePath = buildVideoPath(file.name, fileId);
                const { data, error } = await client.storage.from(getBucketName()).createSignedUploadUrl(storagePath);

                if (error) {
                    throw error;
                }

                uploads.push({
                    id: fileId,
                    path: storagePath,
                    token: data?.token || ''
                });

                state.queue.unshift({
                    id: fileId,
                    name: String(file.name || 'video.mp4'),
                    size: Number(file.size) || 0,
                    type: String(file.type || 'video/mp4'),
                    storagePath,
                    status: 'uploading',
                    createdAt: now,
                    uploadedAt: null,
                    lastError: '',
                    pendingPlatforms: [],
                    sentPlatforms: []
                });
            }

            state = await writeState(client, state);

            return json({
                ok: true,
                uploads,
                state: toClientStateWithMeta(state, origin)
            });
        }

        if (action === 'complete-upload') {
            const uploads = Array.isArray(body.uploads) ? body.uploads : [];
            if (!uploads.length) {
                return errorJson('Nenhum resultado de upload foi informado.', 400);
            }

            const updates = new Map(uploads.map((upload) => [upload.id, upload]));

            state.queue = state.queue.map((video) => {
                if (!updates.has(video.id)) {
                    return video;
                }

                const result = updates.get(video.id);
                if (result.success) {
                    return {
                        ...video,
                        status: 'ready',
                        uploadedAt: new Date().toISOString(),
                        lastError: '',
                        pendingPlatforms: [],
                        sentPlatforms: []
                    };
                }

                return {
                    ...video,
                    status: 'failed',
                    lastError: typeof result.errorMessage === 'string' ? result.errorMessage : 'Falha no upload.',
                    pendingPlatforms: [],
                    sentPlatforms: []
                };
            });

            state = await writeState(client, state);

            return json({
                ok: true,
                state: toClientStateWithMeta(state, origin)
            });
        }

        if (action === 'remove-video') {
            const videoId = typeof body.videoId === 'string' ? body.videoId : '';
            const video = state.queue.find((entry) => entry.id === videoId);
            if (!video) {
                return errorJson('Video nao encontrado.', 404);
            }

            if (video.storagePath) {
                await client.storage.from(getBucketName()).remove([video.storagePath]);
            }

            state.queue = state.queue.filter((entry) => entry.id !== videoId);
            state = await writeState(client, state);

            return json({
                ok: true,
                message: 'Video removido da fila.',
                state: toClientStateWithMeta(state, origin)
            });
        }

        if (action === 'clear-queue') {
            const paths = state.queue.map((video) => video.storagePath).filter(Boolean);
            if (paths.length) {
                await client.storage.from(getBucketName()).remove(paths);
            }

            state.queue = [];
            state = await writeState(client, state);

            return json({
                ok: true,
                message: 'Fila limpa com sucesso.',
                state: toClientStateWithMeta(state, origin)
            });
        }

        if (action === 'publish') {
            const requestedCaption = typeof body.caption === 'string' ? body.caption.trim() : '';
            let connectedPlatforms = getConnectedPlatforms(state);
            if (!connectedPlatforms.length) {
                return errorJson('Conecte ao menos uma rede antes de publicar.', 400);
            }

            for (const connectedPlatform of connectedPlatforms) {
                try {
                    const refreshed = await ensureFreshPlatformAccess(client, state, connectedPlatform.key);
                    state = refreshed.state;
                    if (refreshed.platform) {
                        state.platforms[connectedPlatform.key] = {
                            ...refreshed.platform,
                            lastError: ''
                        };
                    }
                } catch (error) {
                    state.platforms[connectedPlatform.key] = {
                        ...state.platforms[connectedPlatform.key],
                        lastError: `${error?.message || error}`.slice(0, 240),
                        updatedAt: new Date().toISOString()
                    };
                }
            }

            connectedPlatforms = getConnectedPlatforms(state);
            const connectedPlatformKeys = connectedPlatforms.map((platform) => platform.key);
            const publishPlan = state.queue
                .filter((video) => video.status !== 'uploading' && video.status !== 'failed')
                .map((video) => ({
                    video,
                    targets: getTargetPlatformsForVideo(video, connectedPlatformKeys)
                }))
                .filter((item) => item.targets.length);

            if (!publishPlan.length) {
                return errorJson('Nao ha itens pendentes para disparar.', 400);
            }

            const workingVideos = new Map();
            for (const item of publishPlan) {
                workingVideos.set(item.video.id, {
                    ...item.video,
                    status: 'publishing',
                    pendingPlatforms: [...item.targets],
                    sentPlatforms: Array.isArray(item.video.sentPlatforms) ? [...item.video.sentPlatforms] : []
                });
            }

            state.queue = state.queue.map((video) => (
                workingVideos.has(video.id) ? workingVideos.get(video.id) : video
            ));
            state = await writeState(client, state);

            const signedUrlByPath = await buildSignedUrlMap(
                client,
                publishPlan.map((item) => item.video.storagePath)
            );

            const results = [];
            const publishId = crypto.randomUUID();
            const triggeredAt = new Date().toISOString();

            for (const platform of connectedPlatforms) {
                const platformVideos = publishPlan
                    .filter((item) => item.targets.includes(platform.key))
                    .map((item) => item.video);

                if (!platformVideos.length) {
                    continue;
                }

                try {
                    const delivery = await publishVideosToPlatform(platform.key, platform, platformVideos, {
                        caption: requestedCaption,
                        signedUrlByPath
                    });

                    state.platforms[platform.key] = {
                        ...state.platforms[platform.key],
                        updatedAt: new Date().toISOString(),
                        lastError: delivery.status === 'failed' ? delivery.message : ''
                    };

                    delivery.videoResults.forEach((result) => {
                        const nextVideo = workingVideos.get(result.videoId);
                        if (!nextVideo) {
                            return;
                        }

                        if (result.success) {
                            nextVideo.pendingPlatforms = nextVideo.pendingPlatforms.filter((platformKey) => platformKey !== platform.key);
                            if (!nextVideo.sentPlatforms.includes(platform.key)) {
                                nextVideo.sentPlatforms.push(platform.key);
                            }

                            if (nextVideo.lastError.startsWith(`${platform.label}:`)) {
                                nextVideo.lastError = '';
                            }
                        } else {
                            nextVideo.lastError = `${platform.label}: ${result.message}`;
                        }
                    });

                    results.push({
                        platformKey: platform.key,
                        status: delivery.status,
                        videoCount: delivery.videoCount,
                        successCount: delivery.successCount,
                        failedCount: delivery.failedCount,
                        message: delivery.message
                    });
                } catch (error) {
                    const message = `${error?.message || error}`.slice(0, 240);

                    state.platforms[platform.key] = {
                        ...state.platforms[platform.key],
                        updatedAt: new Date().toISOString(),
                        lastError: message
                    };

                    platformVideos.forEach((video) => {
                        const nextVideo = workingVideos.get(video.id);
                        if (nextVideo) {
                            nextVideo.lastError = `${platform.label}: ${message}`;
                        }
                    });

                    results.push({
                        platformKey: platform.key,
                        status: 'failed',
                        videoCount: platformVideos.length,
                        successCount: 0,
                        failedCount: platformVideos.length,
                        message
                    });
                }
            }

            const updatedQueue = state.queue.map((video) => {
                if (!workingVideos.has(video.id)) {
                    return video;
                }

                const workingVideo = workingVideos.get(video.id);
                let nextStatus = 'ready';

                if (!workingVideo.pendingPlatforms.length && workingVideo.sentPlatforms.length) {
                    nextStatus = 'done';
                } else if (workingVideo.sentPlatforms.length) {
                    nextStatus = 'partial';
                }

                return {
                    ...workingVideo,
                    status: nextStatus
                };
            });

            const allSuccess = results.every((result) => result.status === 'done');
            const anySuccess = results.some((result) => result.successCount > 0);
            const totalDeliveries = results.reduce((sum, result) => sum + result.successCount, 0);

            state = normalizeState({
                ...state,
                queue: updatedQueue,
                lastRunAt: triggeredAt,
                logs: [
                    {
                        id: publishId,
                        title: `${publishPlan.length} video(s) disparados para ${results.length} rede(s)`,
                        summary: allSuccess
                            ? `${totalDeliveries} entregas aceitas no lote.`
                            : (anySuccess
                                ? `${totalDeliveries} entrega(s) concluiram e o restante ficou pendente para nova tentativa.`
                                : 'Nenhuma rede concluiu o disparo.'),
                        createdAt: triggeredAt,
                        deliveries: results
                    },
                    ...state.logs
                ]
            });

            state = await writeState(client, state);

            return json({
                ok: true,
                message: allSuccess
                    ? 'Lote publicado com sucesso.'
                    : (anySuccess
                        ? 'Publicacao concluida com pendencias. Verifique o ultimo disparo.'
                        : 'Nenhuma plataforma concluiu o lote.'),
                state: toClientStateWithMeta(state, origin)
            });
        }

        return errorJson('Acao desconhecida.', 400);
    } catch (error) {
        return errorJson(
            'Nao foi possivel concluir a operacao da central social.',
            500,
            `${error?.message || error}`
        );
    }
}
