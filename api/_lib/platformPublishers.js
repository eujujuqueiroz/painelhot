import { buildXOAuthHeader } from './xOAuth.js';

function wait(ms) {
    return new Promise((resolve) => setTimeout(resolve, ms));
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
        const message = data?.error?.message
            || data?.error_description
            || data?.message
            || rawText
            || fallbackMessage;

        throw new Error(message);
    }

    return data;
}

function stripExtension(filename) {
    return String(filename || '')
        .replace(/\.[^.]+$/, '')
        .replace(/[-_]+/g, ' ')
        .trim();
}

function truncate(value, maxLength) {
    const input = String(value || '').trim();
    if (!input) {
        return '';
    }

    return input.length > maxLength ? `${input.slice(0, maxLength - 1)}…` : input;
}

function buildCaption(video, caption) {
    const baseCaption = String(caption || '').trim();
    if (baseCaption) {
        return baseCaption;
    }

    return stripExtension(video.name) || 'Novo video';
}

function buildYouTubeTitle(video, caption) {
    const baseTitle = String(caption || '').split('\n').map((line) => line.trim()).find(Boolean);
    return truncate(baseTitle || stripExtension(video.name) || 'Novo video', 100);
}

async function downloadVideoBuffer(signedUrl) {
    const response = await fetch(signedUrl);
    if (!response.ok) {
        throw new Error('Nao foi possivel baixar o video do Storage para publicar.');
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
}

async function createInstagramContainer(platform, signedUrl, caption) {
    const graphVersion = process.env.INSTAGRAM_GRAPH_VERSION || 'v24.0';
    const endpoint = `https://graph.instagram.com/${graphVersion}/${platform.accountId}/media`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: new URLSearchParams({
            media_type: 'REELS',
            video_url: signedUrl,
            caption,
            share_to_feed: 'true',
            access_token: platform.accessToken
        })
    });

    return readJsonResponse(response, 'Falha ao criar o container do Instagram.');
}

async function waitForInstagramContainer(platform, creationId) {
    const graphVersion = process.env.INSTAGRAM_GRAPH_VERSION || 'v24.0';

    for (let attempt = 0; attempt < 30; attempt += 1) {
        const statusUrl = new URL(`https://graph.instagram.com/${graphVersion}/${creationId}`);
        statusUrl.searchParams.set('fields', 'status_code,status');
        statusUrl.searchParams.set('access_token', platform.accessToken);

        const response = await fetch(statusUrl);
        const status = await readJsonResponse(response, 'Falha ao consultar o status do Instagram.');
        const code = status.status_code || status.status;

        if (code === 'FINISHED' || code === 'PUBLISHED') {
            return;
        }

        if (code === 'ERROR' || code === 'EXPIRED') {
            throw new Error(status.status || 'O Instagram nao conseguiu processar esse video.');
        }

        await wait(4000);
    }

    throw new Error('O Instagram demorou demais para processar o video.');
}

async function publishInstagramVideo(platform, video, caption, signedUrl) {
    const graphVersion = process.env.INSTAGRAM_GRAPH_VERSION || 'v24.0';
    const container = await createInstagramContainer(platform, signedUrl, caption);
    await waitForInstagramContainer(platform, container.id);

    const publishEndpoint = `https://graph.instagram.com/${graphVersion}/${platform.accountId}/media_publish`;
    const publishResponse = await fetch(publishEndpoint, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: new URLSearchParams({
            creation_id: container.id,
            access_token: platform.accessToken
        })
    });

    return readJsonResponse(publishResponse, 'Falha ao publicar o Reel no Instagram.');
}

async function createThreadsContainer(platform, signedUrl, caption) {
    const graphVersion = process.env.THREADS_GRAPH_VERSION || 'v1.0';
    const endpoint = `https://graph.threads.net/${graphVersion}/${platform.accountId}/threads`;

    const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: new URLSearchParams({
            media_type: 'VIDEO',
            video_url: signedUrl,
            text: caption,
            access_token: platform.accessToken
        })
    });

    return readJsonResponse(response, 'Falha ao criar o container do Threads.');
}

async function publishThreadsVideo(platform, video, caption, signedUrl) {
    const graphVersion = process.env.THREADS_GRAPH_VERSION || 'v1.0';
    const container = await createThreadsContainer(platform, signedUrl, caption);

    for (let attempt = 0; attempt < 8; attempt += 1) {
        const endpoint = `https://graph.threads.net/${graphVersion}/${platform.accountId}/threads_publish`;
        const response = await fetch(endpoint, {
            method: 'POST',
            headers: {
                'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
            },
            body: new URLSearchParams({
                creation_id: container.id,
                access_token: platform.accessToken
            })
        });

        if (response.ok) {
            return response.json();
        }

        const rawText = await response.text();
        if (attempt < 7 && /(not ready|processing|builder|media)/i.test(rawText)) {
            await wait(3500);
            continue;
        }

        throw new Error(rawText || 'Falha ao publicar o video no Threads.');
    }

    throw new Error('O Threads nao finalizou a preparacao do video a tempo.');
}

async function queryTikTokCreatorInfo(platform) {
    const response = await fetch('https://open.tiktokapis.com/v2/post/publish/creator_info/query/', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${platform.accessToken}`,
            'content-type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({})
    });

    return readJsonResponse(response, 'Falha ao carregar as preferencias da conta TikTok.');
}

function selectTikTokPrivacyLevel(creatorInfo) {
    const options = Array.isArray(creatorInfo?.privacy_level_options) ? creatorInfo.privacy_level_options : [];

    if (options.includes('PUBLIC_TO_EVERYONE')) {
        return 'PUBLIC_TO_EVERYONE';
    }

    return options[0] || 'SELF_ONLY';
}

async function uploadBufferInChunks(uploadUrl, buffer, mimeType) {
    const chunkSize = Math.min(buffer.length || 1, 10_000_000);
    const totalChunks = Math.ceil(buffer.length / chunkSize);

    for (let chunkIndex = 0; chunkIndex < totalChunks; chunkIndex += 1) {
        const start = chunkIndex * chunkSize;
        const end = Math.min(start + chunkSize, buffer.length);
        const chunk = buffer.subarray(start, end);

        const response = await fetch(uploadUrl, {
            method: 'PUT',
            headers: {
                'content-type': mimeType || 'video/mp4',
                'content-length': String(chunk.length),
                'content-range': `bytes ${start}-${end - 1}/${buffer.length}`
            },
            body: chunk
        });

        if (!response.ok) {
            const rawText = await response.text();
            throw new Error(rawText || 'Falha ao enviar o arquivo para o endpoint de upload.');
        }
    }
}

async function publishTikTokVideo(platform, video, caption, signedUrl) {
    const creatorResponse = await queryTikTokCreatorInfo(platform);
    const creatorInfo = creatorResponse?.data || {};
    const buffer = await downloadVideoBuffer(signedUrl);
    const chunkSize = Math.min(buffer.length || 1, 10_000_000);
    const initResponse = await fetch('https://open.tiktokapis.com/v2/post/publish/video/init/', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${platform.accessToken}`,
            'content-type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({
            post_info: {
                title: truncate(buildCaption(video, caption), 150),
                privacy_level: selectTikTokPrivacyLevel(creatorInfo),
                disable_comment: Boolean(creatorInfo.comment_disabled),
                disable_duet: Boolean(creatorInfo.duet_disabled),
                disable_stitch: Boolean(creatorInfo.stitch_disabled),
                video_cover_timestamp_ms: 1000
            },
            source_info: {
                source: 'FILE_UPLOAD',
                video_size: buffer.length,
                chunk_size: chunkSize,
                total_chunk_count: Math.ceil(buffer.length / chunkSize)
            }
        })
    });

    const initData = await readJsonResponse(initResponse, 'Falha ao inicializar a postagem no TikTok.');
    await uploadBufferInChunks(initData?.data?.upload_url, buffer, video.type || 'video/mp4');

    return initData;
}

async function publishYouTubeVideo(platform, video, caption, signedUrl) {
    const buffer = await downloadVideoBuffer(signedUrl);
    const initResponse = await fetch('https://www.googleapis.com/upload/youtube/v3/videos?uploadType=resumable&part=snippet,status', {
        method: 'POST',
        headers: {
            authorization: `Bearer ${platform.accessToken}`,
            'content-type': 'application/json; charset=UTF-8',
            'x-upload-content-length': String(buffer.length),
            'x-upload-content-type': video.type || 'video/mp4'
        },
        body: JSON.stringify({
            snippet: {
                title: buildYouTubeTitle(video, caption),
                description: truncate(buildCaption(video, caption), 5000)
            },
            status: {
                privacyStatus: process.env.YOUTUBE_DEFAULT_PRIVACY_STATUS || 'private'
            }
        })
    });

    if (!initResponse.ok) {
        const rawText = await initResponse.text();
        throw new Error(rawText || 'Falha ao abrir a sessao de upload do YouTube.');
    }

    const uploadUrl = initResponse.headers.get('location');
    if (!uploadUrl) {
        throw new Error('O YouTube nao retornou a URL de upload resumivel.');
    }

    const uploadResponse = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
            authorization: `Bearer ${platform.accessToken}`,
            'content-type': video.type || 'video/mp4',
            'content-length': String(buffer.length)
        },
        body: buffer
    });

    return readJsonResponse(uploadResponse, 'Falha ao enviar o video para o YouTube.');
}

async function xFormRequest(url, method, formData, token) {
    const response = await fetch(url, {
        method,
        headers: {
            authorization: buildXOAuthHeader({
                url,
                method,
                data: formData,
                token
            }),
            'content-type': 'application/x-www-form-urlencoded;charset=UTF-8'
        },
        body: new URLSearchParams(formData).toString()
    });

    return response;
}

async function xMultipartRequest(url, formData, token) {
    const response = await fetch(url, {
        method: 'POST',
        headers: {
            authorization: buildXOAuthHeader({
                url,
                method: 'POST',
                token
            })
        },
        body: formData
    });

    return response;
}

async function waitForXMediaReady(mediaId, token) {
    const url = new URL('https://upload.twitter.com/1.1/media/upload.json');
    url.searchParams.set('command', 'STATUS');
    url.searchParams.set('media_id', mediaId);

    for (let attempt = 0; attempt < 20; attempt += 1) {
        const response = await fetch(url, {
            headers: {
                authorization: buildXOAuthHeader({
                    url: url.toString(),
                    method: 'GET',
                    token
                })
            }
        });

        const data = await readJsonResponse(response, 'Falha ao consultar o processamento de video no X.');
        const processingState = data?.processing_info?.state;

        if (!processingState || processingState === 'succeeded') {
            return;
        }

        if (processingState === 'failed') {
            throw new Error(data?.processing_info?.error?.message || 'O X rejeitou o processamento do video.');
        }

        const waitSeconds = Number(data?.processing_info?.check_after_secs) || 2;
        await wait(waitSeconds * 1000);
    }

    throw new Error('O X demorou demais para processar o video.');
}

async function publishXVideo(platform, video, caption, signedUrl) {
    const buffer = await downloadVideoBuffer(signedUrl);
    const token = {
        key: platform.accessToken,
        secret: platform.tokenSecret
    };

    const initResponse = await xFormRequest(
        'https://upload.twitter.com/1.1/media/upload.json',
        'POST',
        {
            command: 'INIT',
            media_type: video.type || 'video/mp4',
            total_bytes: String(buffer.length),
            media_category: 'tweet_video'
        },
        token
    );

    const initData = await readJsonResponse(initResponse, 'Falha ao iniciar o upload de midia no X.');
    const mediaId = initData.media_id_string || String(initData.media_id);
    const chunkSize = 5 * 1024 * 1024;

    for (let segmentIndex = 0, start = 0; start < buffer.length; segmentIndex += 1, start += chunkSize) {
        const chunk = buffer.subarray(start, Math.min(start + chunkSize, buffer.length));
        const formData = new FormData();
        formData.set('command', 'APPEND');
        formData.set('media_id', mediaId);
        formData.set('segment_index', String(segmentIndex));
        formData.set('media', new Blob([chunk], { type: video.type || 'video/mp4' }), video.name || 'video.mp4');

        const appendResponse = await xMultipartRequest('https://upload.twitter.com/1.1/media/upload.json', formData, token);
        if (!appendResponse.ok) {
            const rawText = await appendResponse.text();
            throw new Error(rawText || 'Falha ao enviar um segmento de video para o X.');
        }
    }

    const finalizeResponse = await xFormRequest(
        'https://upload.twitter.com/1.1/media/upload.json',
        'POST',
        {
            command: 'FINALIZE',
            media_id: mediaId
        },
        token
    );

    await readJsonResponse(finalizeResponse, 'Falha ao finalizar o upload de video no X.');
    await waitForXMediaReady(mediaId, token);

    const tweetEndpoint = 'https://api.x.com/2/tweets';
    const tweetText = truncate(buildCaption(video, caption), 270);
    const tweetResponse = await fetch(tweetEndpoint, {
        method: 'POST',
        headers: {
            authorization: buildXOAuthHeader({
                url: tweetEndpoint,
                method: 'POST',
                token
            }),
            'content-type': 'application/json; charset=UTF-8'
        },
        body: JSON.stringify({
            text: tweetText,
            media: {
                media_ids: [mediaId]
            }
        })
    });

    return readJsonResponse(tweetResponse, 'Falha ao criar o post no X.');
}

export async function publishVideosToPlatform(platformKey, platform, videos, context) {
    const videoResults = [];
    let successCount = 0;
    let failedCount = 0;

    for (const video of videos) {
        const signedUrl = context.signedUrlByPath[video.storagePath];
        const caption = buildCaption(video, context.caption);

        try {
            if (!signedUrl) {
                throw new Error('Nao foi possivel gerar a URL assinada para esse video.');
            }

            if (platformKey === 'instagram') {
                await publishInstagramVideo(platform, video, caption, signedUrl);
            }

            if (platformKey === 'threads') {
                await publishThreadsVideo(platform, video, caption, signedUrl);
            }

            if (platformKey === 'tiktok') {
                await publishTikTokVideo(platform, video, caption, signedUrl);
            }

            if (platformKey === 'youtube') {
                await publishYouTubeVideo(platform, video, caption, signedUrl);
            }

            if (platformKey === 'x') {
                await publishXVideo(platform, video, caption, signedUrl);
            }

            successCount += 1;
            videoResults.push({
                videoId: video.id,
                success: true,
                message: 'Publicado com sucesso.'
            });
        } catch (error) {
            failedCount += 1;
            videoResults.push({
                videoId: video.id,
                success: false,
                message: `${error?.message || error}`.slice(0, 240)
            });
        }
    }

    return {
        status: failedCount === 0 ? 'done' : (successCount === 0 ? 'failed' : 'partial'),
        videoCount: videos.length,
        successCount,
        failedCount,
        message: failedCount
            ? `${successCount} video(s) enviados e ${failedCount} falharam.`
            : `${successCount} video(s) enviados com sucesso.`,
        videoResults
    };
}
