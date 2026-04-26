document.addEventListener('DOMContentLoaded', () => {
    const mobileToggle = document.getElementById('mobile-toggle');
    const sidebar = document.querySelector('.sidebar');
    const navItems = document.querySelectorAll('.nav-item');
    const sections = document.querySelectorAll('.admin-section');

    const profilesFeedback = document.getElementById('profiles-feedback');
    const connectedCount = document.getElementById('connected-count');
    const queuedVideosCount = document.getElementById('queued-videos-count');
    const distributionCount = document.getElementById('distribution-count');
    const activeDestinations = document.getElementById('active-destinations');
    const publishReadyState = document.getElementById('publish-ready-state');
    const queueMeta = document.getElementById('queue-meta');
    const videoQueue = document.getElementById('video-queue');
    const publishLog = document.getElementById('publish-log');
    const profilesLastRun = document.getElementById('profiles-last-run');
    const clearVideosBtn = document.getElementById('clear-videos');
    const publishAllBtn = document.getElementById('publish-all-videos');
    const videoUploadInput = document.getElementById('video-upload');
    const uploadDropzone = document.querySelector('.upload-dropzone');
    const uploadProgressNote = document.getElementById('upload-progress-note');
    const publishCaptionInput = document.getElementById('publish-caption');

    const platformModal = document.getElementById('platform-modal');
    const platformModalTitle = document.getElementById('platform-modal-title');
    const platformModalStatus = document.getElementById('platform-modal-status');
    const platformModalAuth = document.getElementById('platform-modal-auth');
    const platformModalPublish = document.getElementById('platform-modal-publish');
    const platformModalAccount = document.getElementById('platform-modal-account');
    const platformModalCallback = document.getElementById('platform-modal-callback');
    const platformModalRequirements = document.getElementById('platform-modal-requirements');
    const platformModalMissing = document.getElementById('platform-modal-missing');
    const platformModalFeedback = document.getElementById('platform-modal-feedback');
    const disconnectPlatformBtn = document.getElementById('disconnect-platform-btn');
    const startConnectBtn = document.getElementById('start-connect-btn');
    const closePlatformModalBtn = document.getElementById('close-platform-modal');
    const cancelPlatformBtn = document.getElementById('cancel-platform-btn');
    const dashboardRevenue = document.getElementById('dashboard-revenue');
    const dashboardRevenueTrend = document.getElementById('dashboard-revenue-trend');
    const dashboardActiveSubscribers = document.getElementById('dashboard-active-subscribers');
    const dashboardActiveTrend = document.getElementById('dashboard-active-trend');
    const dashboardProfileViews = document.getElementById('dashboard-profile-views');
    const dashboardViewsTrend = document.getElementById('dashboard-views-trend');
    const recentSubscriptionsBody = document.getElementById('recent-subscriptions-body');
    const subscribersTableBody = document.getElementById('subscribers-table-body');
    const plansStatus = document.getElementById('plans-status');
    const profileStatus = document.getElementById('profile-status');
    const savePlansBtn = document.getElementById('save-plans');
    const saveProfileBtn = document.getElementById('save-profile');
    const profileDisplayNameInput = document.getElementById('profile-display-name');
    const profileBioInput = document.getElementById('profile-bio');
    const profileMonthlyPriceInput = document.getElementById('profile-monthly-price');
    const settingsSupabaseStatus = document.getElementById('settings-supabase-status');
    const settingsUpdatedAt = document.getElementById('settings-updated-at');

    const platformDefinitions = {
        instagram: { key: 'instagram', label: 'Instagram' },
        tiktok: { key: 'tiktok', label: 'TikTok' },
        youtube: { key: 'youtube', label: 'YouTube' },
        x: { key: 'x', label: 'X' },
        threads: { key: 'threads', label: 'Threads' }
    };

    const defaultPlatformState = Object.fromEntries(
        Object.keys(platformDefinitions).map((key) => [
            key,
            {
                key,
                label: platformDefinitions[key].label,
                connected: false,
                handle: '',
                accountId: '',
                avatarUrl: '',
                profileUrl: '',
                updatedAt: null,
                lastError: '',
                envReady: false,
                missingEnvKeys: [],
                authType: 'OAuth',
                publishMode: '',
                requirements: '',
                callbackUrl: '',
                connectUrl: '',
                hasRefreshToken: false,
                scopes: []
            }
        ])
    );

    const state = {
        supabase: null,
        platforms: { ...defaultPlatformState },
        queue: [],
        logs: [],
        lastRunAt: null,
        isLoading: false,
        isPublishing: false,
        isAdminLoading: false,
        isAdminSaving: false,
        pendingUploads: 0,
        storageClient: null,
        currentModalPlatformKey: '',
        feedbackOverride: null,
        admin: null
    };

    let supabaseBrowserModulePromise = null;

    function escapeHtml(value) {
        return String(value)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;');
    }

    function formatBytes(bytes) {
        if (!bytes) {
            return '0 MB';
        }

        const units = ['B', 'KB', 'MB', 'GB'];
        const unitIndex = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
        const value = bytes / Math.pow(1024, unitIndex);
        const precision = unitIndex === 0 ? 0 : 1;
        return `${value.toFixed(precision)} ${units[unitIndex]}`;
    }

    function formatRunTime(dateLike) {
        if (!dateLike) {
            return 'Aguardando';
        }

        const date = new Date(dateLike);
        if (Number.isNaN(date.getTime())) {
            return 'Aguardando';
        }

        return new Intl.DateTimeFormat('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit'
        }).format(date);
    }

    function getErrorMessage(error, fallback = 'Ocorreu um erro inesperado.') {
        if (!error) {
            return fallback;
        }

        if (typeof error === 'string') {
            return error;
        }

        if (typeof error.message === 'string' && error.message) {
            return error.message;
        }

        return fallback;
    }

    function setProfilesFeedback(type, message) {
        if (!profilesFeedback) {
            return;
        }

        profilesFeedback.classList.remove('is-ready', 'is-error');
        if (type === 'ready') {
            profilesFeedback.classList.add('is-ready');
        }
        if (type === 'error') {
            profilesFeedback.classList.add('is-error');
        }

        profilesFeedback.textContent = message;
    }

    function setPlatformModalFeedback(type, message) {
        if (!platformModalFeedback) {
            return;
        }

        platformModalFeedback.classList.remove('is-ready', 'is-error');
        if (type === 'ready') {
            platformModalFeedback.classList.add('is-ready');
        }
        if (type === 'error') {
            platformModalFeedback.classList.add('is-error');
        }

        platformModalFeedback.textContent = message || '';
    }

    function setFeedbackOverride(type, message, durationMs = 7000) {
        state.feedbackOverride = {
            type,
            message,
            expiresAt: Date.now() + durationMs
        };
    }

    function setAdminStatus(target, type, message) {
        if (!target) {
            return;
        }

        target.classList.remove('is-ready', 'is-error');
        if (type === 'ready') {
            target.classList.add('is-ready');
        }
        if (type === 'error') {
            target.classList.add('is-error');
        }
        target.textContent = message || '';
    }

    function applyAdminState(adminState) {
        if (!adminState) {
            return;
        }

        state.admin = adminState;
    }

    async function adminApiRequest(method, payload) {
        const response = await fetch('/api/admin', {
            method,
            headers: {
                'content-type': 'application/json'
            },
            body: payload ? JSON.stringify(payload) : undefined
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) {
            throw new Error(data.error || data.details || 'Falha ao falar com a central administrativa.');
        }

        return data;
    }

    function getAdminDashboard() {
        return state.admin?.dashboard || {
            totalRevenue: 'R$ 0,00',
            activeSubscribers: 0,
            profileViews: 0,
            profileViewsDelta24h: 0,
            recentSubscribers: []
        };
    }

    function formatSubscriberDate(dateLike) {
        if (!dateLike) {
            return 'Sem data';
        }

        const date = new Date(dateLike);
        if (Number.isNaN(date.getTime())) {
            return 'Sem data';
        }

        return new Intl.DateTimeFormat('pt-BR', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        }).format(date);
    }

    function formatSubscriberStatus(status) {
        const labels = {
            active: 'Ativo',
            inactive: 'Inativo',
            pending: 'Pendente',
            cancelled: 'Cancelado'
        };

        return labels[status] || 'Indefinido';
    }

    function getSubscriberStatusClass(status) {
        return ['active', 'pending', 'inactive', 'cancelled'].includes(status)
            ? `status-${status}`
            : 'status-inactive';
    }

    function renderSubscriberRows(subscribers, options = {}) {
        const showAmount = options.showAmount !== false;
        const columns = 4;

        if (!Array.isArray(subscribers) || !subscribers.length) {
            return `
                <tr>
                    <td colspan="${columns}" class="empty-table-cell">Nenhum assinante real sincronizado ainda.</td>
                </tr>
            `;
        }

        return subscribers.map((subscriber) => `
            <tr>
                <td class="user-cell">
                    ${subscriber.avatarUrl ? `<img src="${escapeHtml(subscriber.avatarUrl)}" class="avatar-mini" alt="">` : '<span class="avatar-mini"></span>'}
                    <span>${escapeHtml(subscriber.name || subscriber.email || 'Assinante')}</span>
                </td>
                <td>${escapeHtml(subscriber.planName || 'Plano nao informado')}</td>
                <td>${showAmount ? escapeHtml(subscriber.amountCents ? new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(subscriber.amountCents / 100) : 'R$ 0,00') : escapeHtml(formatSubscriberDate(subscriber.createdAt))}</td>
                <td><span class="status-badge ${escapeHtml(getSubscriberStatusClass(subscriber.status))}">${escapeHtml(formatSubscriberStatus(subscriber.status))}</span></td>
            </tr>
        `).join('');
    }

    function renderAdminState() {
        const admin = state.admin;
        const dashboard = getAdminDashboard();

        if (dashboardRevenue) {
            dashboardRevenue.textContent = dashboard.totalRevenue || 'R$ 0,00';
        }
        if (dashboardRevenueTrend) {
            dashboardRevenueTrend.innerHTML = '<i class="fas fa-database"></i> Calculado a partir de assinantes reais';
        }
        if (dashboardActiveSubscribers) {
            dashboardActiveSubscribers.textContent = String(dashboard.activeSubscribers || 0);
        }
        if (dashboardActiveTrend) {
            dashboardActiveTrend.innerHTML = dashboard.activeSubscribers
                ? '<i class="fas fa-user-check"></i> Base ativa sincronizada'
                : '<i class="fas fa-user-check"></i> Nenhum assinante sincronizado';
        }
        if (dashboardProfileViews) {
            dashboardProfileViews.textContent = new Intl.NumberFormat('pt-BR').format(Number(dashboard.profileViews || 0));
        }
        if (dashboardViewsTrend) {
            dashboardViewsTrend.innerHTML = `<i class="fas fa-eye"></i> ${Number(dashboard.profileViewsDelta24h || 0)} nas ultimas 24h`;
        }
        if (recentSubscriptionsBody) {
            recentSubscriptionsBody.innerHTML = renderSubscriberRows(dashboard.recentSubscribers || [], { showAmount: false });
        }
        if (subscribersTableBody) {
            subscribersTableBody.innerHTML = renderSubscriberRows(admin?.subscribers || [], { showAmount: true });
        }

        (admin?.plans || []).forEach((plan) => {
            const nameInput = document.querySelector(`.plan-name[data-plan="${plan.id}"]`);
            const priceInput = document.querySelector(`.plan-price[data-plan="${plan.id}"]`);
            if (nameInput && document.activeElement !== nameInput) {
                nameInput.value = plan.name || '';
            }
            if (priceInput && document.activeElement !== priceInput) {
                priceInput.value = plan.price || '';
            }
        });

        if (profileDisplayNameInput && document.activeElement !== profileDisplayNameInput) {
            profileDisplayNameInput.value = admin?.profile?.displayName || '';
        }
        if (profileBioInput && document.activeElement !== profileBioInput) {
            profileBioInput.value = admin?.profile?.bio || '';
        }
        if (profileMonthlyPriceInput && document.activeElement !== profileMonthlyPriceInput) {
            profileMonthlyPriceInput.value = admin?.profile?.monthlyPrice || '';
        }
        if (settingsSupabaseStatus) {
            settingsSupabaseStatus.textContent = state.admin ? 'Conectado' : 'Aguardando conexao';
        }
        if (settingsUpdatedAt) {
            settingsUpdatedAt.textContent = formatRunTime(admin?.updatedAt);
        }
        if (savePlansBtn) {
            savePlansBtn.disabled = state.isAdminLoading || state.isAdminSaving;
        }
        if (saveProfileBtn) {
            saveProfileBtn.disabled = state.isAdminLoading || state.isAdminSaving;
        }
    }

    function applyServerState(serverState) {
        if (!serverState) {
            return;
        }

        state.supabase = serverState.supabase || null;
        state.platforms = {
            ...defaultPlatformState,
            ...(serverState.platforms || {})
        };
        state.queue = Array.isArray(serverState.queue) ? serverState.queue : [];
        state.logs = Array.isArray(serverState.logs) ? serverState.logs : [];
        state.lastRunAt = serverState.lastRunAt || null;
    }

    async function apiRequest(method, payload) {
        const response = await fetch('/api/social', {
            method,
            headers: {
                'content-type': 'application/json'
            },
            body: payload ? JSON.stringify(payload) : undefined
        });

        const data = await response.json().catch(() => ({}));
        if (!response.ok || data.ok === false) {
            throw new Error(data.error || data.details || 'Falha ao falar com a central social.');
        }

        return data;
    }

    async function getStorageClient() {
        if (state.storageClient) {
            return state.storageClient;
        }

        if (!state.supabase || !state.supabase.url || !state.supabase.anonKey || !state.supabase.bucket) {
            throw new Error('A configuracao publica do Supabase ainda nao foi carregada.');
        }

        if (!supabaseBrowserModulePromise) {
            supabaseBrowserModulePromise = import('https://esm.sh/@supabase/supabase-js@2');
        }

        const { createClient } = await supabaseBrowserModulePromise;
        state.storageClient = createClient(state.supabase.url, state.supabase.anonKey, {
            auth: {
                persistSession: false,
                autoRefreshToken: false,
                detectSessionInUrl: false
            }
        });

        return state.storageClient;
    }

    function activateSection(sectionId) {
        navItems.forEach((item) => {
            item.classList.toggle('active', item.getAttribute('data-section') === sectionId);
        });

        sections.forEach((section) => {
            section.style.display = section.id === sectionId ? 'block' : 'none';
        });
    }

    function readInitialRouteState() {
        const params = new URLSearchParams(window.location.search);
        const requestedSection = params.get('admin_section');
        if (requestedSection && document.getElementById(requestedSection)) {
            activateSection(requestedSection);
        }

        const socialStatus = params.get('social_status');
        const socialPlatform = params.get('social_platform');
        const socialMessage = params.get('social_message');

        if (socialStatus && socialMessage) {
            setFeedbackOverride(socialStatus === 'connected' ? 'ready' : 'error', socialMessage, 9000);
        } else if (socialStatus && socialPlatform && platformDefinitions[socialPlatform]) {
            setFeedbackOverride(
                socialStatus === 'connected' ? 'ready' : 'error',
                socialStatus === 'connected'
                    ? `${platformDefinitions[socialPlatform].label} conectado com sucesso.`
                    : `Falha ao conectar ${platformDefinitions[socialPlatform].label}.`,
                9000
            );
        }

        if (requestedSection || socialStatus || socialPlatform || socialMessage) {
            const cleanUrl = new URL(window.location.href);
            cleanUrl.searchParams.delete('admin_section');
            cleanUrl.searchParams.delete('social_status');
            cleanUrl.searchParams.delete('social_platform');
            cleanUrl.searchParams.delete('social_message');
            window.history.replaceState({}, '', cleanUrl);
        }
    }

    function getConnectedPlatforms() {
        return Object.entries(state.platforms)
            .filter(([, platform]) => platform.connected)
            .map(([key, platform]) => ({ key, ...platform }));
    }

    function getPendingPlatformsForVideo(video) {
        if (Array.isArray(video.pendingPlatforms) && video.pendingPlatforms.length) {
            return video.pendingPlatforms
                .map((platformKey) => state.platforms[platformKey])
                .filter(Boolean);
        }

        const connectedPlatforms = getConnectedPlatforms();

        if (Array.isArray(video.sentPlatforms) && video.sentPlatforms.length) {
            return connectedPlatforms.filter((platform) => !video.sentPlatforms.includes(platform.key));
        }

        return connectedPlatforms;
    }

    function getDeliveryCount() {
        return state.queue
            .filter((video) => video.status !== 'failed' && video.status !== 'uploading' && video.status !== 'done')
            .reduce((total, video) => total + getPendingPlatformsForVideo(video).length, 0);
    }

    function hasPublishableQueue() {
        return state.queue.some((video) => (
            video.status !== 'uploading'
            && video.status !== 'failed'
            && getPendingPlatformsForVideo(video).length > 0
        ));
    }

    function updateProfilesSummary() {
        const connectedPlatforms = getConnectedPlatforms();
        const deliveryCount = getDeliveryCount();

        if (connectedCount) {
            connectedCount.textContent = `${connectedPlatforms.length}/5`;
        }

        if (queuedVideosCount) {
            queuedVideosCount.textContent = String(state.queue.length);
        }

        if (distributionCount) {
            distributionCount.textContent = String(deliveryCount);
        }

        if (activeDestinations) {
            activeDestinations.textContent = connectedPlatforms.length
                ? connectedPlatforms.map((platform) => platform.label).join(', ')
                : 'Nenhuma rede conectada';
        }

        if (publishReadyState) {
            if (state.pendingUploads > 0) {
                publishReadyState.textContent = `Enviando ${state.pendingUploads} arquivo(s)`;
            } else if (state.isPublishing) {
                publishReadyState.textContent = 'Disparando lote';
            } else if (!state.queue.length) {
                publishReadyState.textContent = 'Aguardando videos';
            } else if (!connectedPlatforms.length) {
                publishReadyState.textContent = 'Conecte redes para publicar';
            } else if (!hasPublishableQueue()) {
                publishReadyState.textContent = 'Fila concluida';
            } else {
                publishReadyState.textContent = `${deliveryCount} entrega(s) pendentes`;
            }
        }

        if (queueMeta) {
            queueMeta.textContent = `${state.queue.length} arquivo(s) carregados`;
        }

        if (profilesLastRun) {
            profilesLastRun.textContent = state.lastRunAt
                ? formatRunTime(state.lastRunAt)
                : 'Aguardando primeira publicacao';
        }

        if (uploadProgressNote) {
            uploadProgressNote.textContent = state.pendingUploads > 0
                ? `Upload em andamento para ${state.pendingUploads} arquivo(s).`
                : 'Os arquivos entram no Storage primeiro e depois ficam prontos para o disparo em lote.';
        }

        if (state.feedbackOverride && state.feedbackOverride.expiresAt > Date.now()) {
            setProfilesFeedback(state.feedbackOverride.type, state.feedbackOverride.message);
            return;
        }

        state.feedbackOverride = null;

        if (state.isLoading) {
            setProfilesFeedback('info', 'Sincronizando perfis, fila e historico...');
            return;
        }

        if (state.pendingUploads > 0) {
            setProfilesFeedback('info', `Subindo ${state.pendingUploads} arquivo(s) para o Storage. Aguarde o preparo do lote.`);
            return;
        }

        if (state.isPublishing) {
            setProfilesFeedback('info', 'Enviando o lote para as plataformas conectadas.');
            return;
        }

        if (!connectedPlatforms.length && !state.queue.length) {
            setProfilesFeedback('info', 'Conecte ao menos uma rede e adicione videos para disparar a publicacao em lote.');
        } else if (!connectedPlatforms.length) {
            setProfilesFeedback('error', 'Existem videos na fila, mas nenhuma rede esta conectada.');
        } else if (!state.queue.length) {
            setProfilesFeedback('info', 'As redes ja estao conectadas. Agora basta selecionar os videos.');
        } else if (!hasPublishableQueue()) {
            setProfilesFeedback('ready', 'A fila atual ja foi concluida. Limpe ou envie novos videos para o proximo lote.');
        } else {
            setProfilesFeedback('ready', `${deliveryCount} distribuicoes prontas para um disparo em 1 clique.`);
        }
    }

    function renderPlatformState() {
        document.querySelectorAll('.platform-row').forEach((row) => {
            const platformKey = row.getAttribute('data-platform');
            const platform = state.platforms[platformKey];
            if (!platform) {
                return;
            }

            const handle = row.querySelector('.platform-handle');
            const detail = row.querySelector('.platform-detail');
            const badge = row.querySelector('.connection-badge');
            const button = row.querySelector('.btn-platform');

            row.classList.toggle('is-connected', platform.connected);

            if (handle) {
                handle.textContent = platform.connected
                    ? platform.handle || 'Conta conectada'
                    : (platform.envReady ? 'Pronto para conectar' : 'Configuracao do app pendente');
            }

            if (detail) {
                if (platform.connected) {
                    detail.textContent = platform.lastError
                        ? platform.lastError
                        : `${platform.publishMode} • atualizado em ${formatRunTime(platform.updatedAt)}`;
                } else if (!platform.envReady) {
                    detail.textContent = `Faltam: ${platform.missingEnvKeys.join(', ')}`;
                } else {
                    detail.textContent = `${platform.authType} • ${platform.publishMode}`;
                }
            }

            if (badge) {
                badge.classList.remove('connected', 'disconnected');
                if (platform.connected) {
                    badge.classList.add('connected');
                    badge.textContent = 'Conectado';
                } else {
                    badge.classList.add('disconnected');
                    badge.textContent = platform.envReady ? 'Pronto' : 'App pendente';
                }
            }

            if (button) {
                button.classList.toggle('is-connected', platform.connected);
                button.disabled = state.isLoading || state.isPublishing;
                button.textContent = platform.connected ? 'Gerenciar' : 'Conectar';
            }
        });
    }

    function buildVideoChipMarkup(video) {
        const sentPlatforms = Array.isArray(video.sentPlatforms) ? video.sentPlatforms : [];
        const pendingPlatforms = getPendingPlatformsForVideo(video).map((platform) => platform.key);
        const chips = [];

        sentPlatforms.forEach((platformKey) => {
            if (state.platforms[platformKey]) {
                chips.push(`<span class="queue-chip is-done">${escapeHtml(state.platforms[platformKey].label)}</span>`);
            }
        });

        pendingPlatforms.forEach((platformKey) => {
            if (state.platforms[platformKey]) {
                chips.push(`<span class="queue-chip is-pending">${escapeHtml(state.platforms[platformKey].label)}</span>`);
            }
        });

        if (!chips.length) {
            return '<span class="queue-chip">Sem destinos pendentes</span>';
        }

        return chips.join('');
    }

    function renderVideoQueue() {
        if (!videoQueue) {
            return;
        }

        if (!state.queue.length) {
            videoQueue.classList.add('empty');
            videoQueue.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-photo-film"></i>
                    <p>Nenhum video carregado ainda.</p>
                </div>
            `;
            return;
        }

        const statusMap = {
            uploading: { label: 'Subindo', className: 'publishing' },
            ready: { label: 'Pronto', className: 'ready' },
            publishing: { label: 'Disparando', className: 'publishing' },
            partial: { label: 'Parcial', className: 'partial' },
            done: { label: 'Publicado', className: 'done' },
            failed: { label: 'Falhou', className: 'failed' }
        };

        videoQueue.classList.remove('empty');
        videoQueue.innerHTML = state.queue.map((video) => {
            const currentStatus = statusMap[video.status] || statusMap.ready;
            const pendingPlatforms = getPendingPlatformsForVideo(video);

            let subtitle = `${formatBytes(video.size)} • ${pendingPlatforms.length} destino(s) pendentes`;
            if (video.status === 'uploading') {
                subtitle = `${formatBytes(video.size)} • enviando para o Storage`;
            }
            if (video.status === 'done') {
                subtitle = `${formatBytes(video.size)} • lote concluido`;
            }
            if (video.status === 'failed') {
                subtitle = `${formatBytes(video.size)} • upload com falha`;
            }

            return `
                <article class="queue-item" data-video-id="${escapeHtml(video.id)}">
                    <div class="queue-item-main">
                        <div class="queue-item-top">
                            <span class="queue-item-title">${escapeHtml(video.name)}</span>
                            <span class="queue-status ${currentStatus.className}">${currentStatus.label}</span>
                        </div>
                        <div class="queue-item-subtitle">${escapeHtml(subtitle)}</div>
                        <div class="queue-chip-row">${buildVideoChipMarkup(video)}</div>
                        ${video.lastError ? `<div class="queue-error">${escapeHtml(video.lastError)}</div>` : ''}
                    </div>
                    <div class="queue-item-actions">
                        <button type="button" class="queue-remove" data-remove-video="${escapeHtml(video.id)}" aria-label="Remover video" ${state.isLoading || state.isPublishing ? 'disabled' : ''}>
                            <i class="fas fa-trash"></i>
                        </button>
                    </div>
                </article>
            `;
        }).join('');
    }

    function renderPublishLog() {
        if (!publishLog) {
            return;
        }

        if (!state.logs.length) {
            publishLog.classList.add('empty');
            publishLog.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-wave-square"></i>
                    <p>O historico do disparo vai aparecer aqui.</p>
                </div>
            `;
            return;
        }

        publishLog.classList.remove('empty');
        publishLog.innerHTML = state.logs.map((log) => {
            const chips = Array.isArray(log.deliveries)
                ? log.deliveries.map((delivery) => {
                    const platformLabel = state.platforms[delivery.platformKey]?.label || delivery.platformKey;
                    const className = delivery.status === 'failed'
                        ? 'failed'
                        : (delivery.status === 'partial' ? 'partial' : 'done');
                    return `
                        <span class="publish-log-chip ${className}">
                            <span>${escapeHtml(platformLabel)}</span>
                            <span>${escapeHtml(String(delivery.successCount || delivery.videoCount || 0))}</span>
                        </span>
                    `;
                }).join('')
                : '';

            return `
                <article class="publish-log-item">
                    <div class="publish-log-main">
                        <strong>${escapeHtml(log.title || 'Disparo social')}</strong>
                        <span>${escapeHtml(log.summary || '')}</span>
                        ${chips ? `<div class="publish-log-results">${chips}</div>` : ''}
                    </div>
                    <span class="queue-status done">${escapeHtml(formatRunTime(log.createdAt))}</span>
                </article>
            `;
        }).join('');
    }

    function syncPublishingButtons() {
        if (publishAllBtn) {
            publishAllBtn.disabled = state.isLoading || state.isPublishing || state.pendingUploads > 0 || !hasPublishableQueue();
            publishAllBtn.textContent = state.isPublishing ? 'Publicando...' : 'Publicar em 1 clique';
        }

        if (clearVideosBtn) {
            clearVideosBtn.disabled = state.isLoading || state.isPublishing || !state.queue.length;
        }

        if (videoUploadInput) {
            videoUploadInput.disabled = state.isLoading || state.isPublishing;
        }

        if (disconnectPlatformBtn) {
            const platform = state.platforms[state.currentModalPlatformKey];
            disconnectPlatformBtn.disabled = state.isLoading || !platform || !platform.connected;
        }

        if (startConnectBtn) {
            const platform = state.platforms[state.currentModalPlatformKey];
            startConnectBtn.disabled = state.isLoading || !platform || !platform.envReady;
            startConnectBtn.textContent = platform?.connected ? 'Reconectar conta' : 'Conectar conta';
        }
    }

    function refreshProfilesSurface() {
        renderPlatformState();
        renderVideoQueue();
        renderPublishLog();
        updateProfilesSummary();
        syncPublishingButtons();

        if (platformModal && !platformModal.hidden && state.currentModalPlatformKey) {
            populatePlatformModal(state.currentModalPlatformKey);
        }
    }

    function populatePlatformModal(platformKey) {
        const platform = state.platforms[platformKey];
        if (!platform) {
            return;
        }

        state.currentModalPlatformKey = platformKey;
        platformModalTitle.textContent = `${platform.connected ? 'Gerenciar' : 'Conectar'} ${platform.label}`;
        platformModalStatus.textContent = platform.connected ? 'Conectado' : (platform.envReady ? 'Pronto para conectar' : 'App pendente');
        platformModalAuth.textContent = platform.authType || 'OAuth';
        platformModalPublish.textContent = platform.publishMode || 'Upload nativo';
        platformModalAccount.textContent = platform.connected
            ? `${platform.handle || 'Conta conectada'}${platform.accountId ? ` • ${platform.accountId}` : ''}`
            : 'Nenhuma conta conectada';
        platformModalCallback.textContent = platform.callbackUrl || '-';
        platformModalRequirements.textContent = platform.requirements || '-';
        disconnectPlatformBtn.hidden = !platform.connected;

        if (platformModalMissing) {
            if (platform.envReady) {
                platformModalMissing.innerHTML = `
                    <div class="platform-missing-item">
                        <strong>App pronto</strong>
                        As credenciais do aplicativo dessa rede ja estao configuradas para iniciar a autorizacao oficial.
                    </div>
                `;
            } else {
                platformModalMissing.innerHTML = `
                    <div class="platform-missing-item">
                        <strong>Faltam variaveis do app</strong>
                        ${escapeHtml(platform.missingEnvKeys.join(', '))}
                    </div>
                `;
            }
        }

        if (platform.connected) {
            setPlatformModalFeedback(platform.lastError ? 'error' : 'ready', platform.lastError || 'Conta conectada e pronta para receber o lote.');
        } else if (!platform.envReady) {
            setPlatformModalFeedback('error', 'Essa rede ainda nao pode ser conectada porque faltam credenciais do aplicativo no ambiente.');
        } else {
            setPlatformModalFeedback('', 'Ao continuar, voce sera levado para o login oficial da plataforma.');
        }
    }

    function openPlatformModal(platformKey) {
        if (!platformModal || !state.platforms[platformKey]) {
            return;
        }

        populatePlatformModal(platformKey);
        platformModal.hidden = false;
        document.body.classList.add('modal-open');
        syncPublishingButtons();
    }

    function closePlatformModal() {
        if (!platformModal) {
            return;
        }

        platformModal.hidden = true;
        document.body.classList.remove('modal-open');
        state.currentModalPlatformKey = '';
        setPlatformModalFeedback('', '');
        syncPublishingButtons();
    }

    async function loadProfilesState() {
        state.isLoading = true;
        refreshProfilesSurface();

        try {
            const data = await apiRequest('GET');
            applyServerState(data.state);
        } catch (error) {
            setFeedbackOverride('error', getErrorMessage(error, 'Nao foi possivel carregar a central social.'), 9000);
        } finally {
            state.isLoading = false;
            refreshProfilesSurface();
        }
    }

    async function loadAdminState() {
        state.isAdminLoading = true;
        renderAdminState();

        try {
            const data = await adminApiRequest('GET');
            applyAdminState(data.state);
        } catch (error) {
            setAdminStatus(profileStatus, 'error', getErrorMessage(error, 'Nao foi possivel carregar o painel real.'));
            setAdminStatus(plansStatus, 'error', getErrorMessage(error, 'Nao foi possivel carregar os planos reais.'));
        } finally {
            state.isAdminLoading = false;
            renderAdminState();
        }
    }

    async function saveProfile() {
        try {
            state.isAdminSaving = true;
            setAdminStatus(profileStatus, '', 'Salvando perfil...');
            renderAdminState();

            const data = await adminApiRequest('POST', {
                action: 'save-profile',
                profile: {
                    displayName: profileDisplayNameInput ? profileDisplayNameInput.value : '',
                    bio: profileBioInput ? profileBioInput.value : '',
                    monthlyPrice: profileMonthlyPriceInput ? profileMonthlyPriceInput.value : ''
                }
            });
            applyAdminState(data.state);
            setAdminStatus(profileStatus, 'ready', data.message || 'Perfil salvo em producao.');
        } catch (error) {
            setAdminStatus(profileStatus, 'error', getErrorMessage(error, 'Nao foi possivel salvar o perfil.'));
        } finally {
            state.isAdminSaving = false;
            renderAdminState();
        }
    }

    async function savePlans() {
        try {
            state.isAdminSaving = true;
            setAdminStatus(plansStatus, '', 'Salvando planos...');
            renderAdminState();

            const plans = Array.from(document.querySelectorAll('.plan-name')).map((nameInput) => {
                const planId = nameInput.getAttribute('data-plan');
                const priceInput = document.querySelector(`.plan-price[data-plan="${planId}"]`);

                return {
                    id: planId,
                    name: nameInput.value,
                    price: priceInput ? priceInput.value : ''
                };
            });

            const data = await adminApiRequest('POST', {
                action: 'save-plans',
                plans
            });
            applyAdminState(data.state);
            setAdminStatus(plansStatus, 'ready', data.message || 'Planos salvos em producao.');
        } catch (error) {
            setAdminStatus(plansStatus, 'error', getErrorMessage(error, 'Nao foi possivel salvar os planos.'));
        } finally {
            state.isAdminSaving = false;
            renderAdminState();
        }
    }

    async function disconnectCurrentPlatform() {
        const platformKey = state.currentModalPlatformKey;
        const platform = state.platforms[platformKey];
        if (!platform) {
            return;
        }

        try {
            state.isLoading = true;
            refreshProfilesSurface();
            const data = await apiRequest('POST', {
                action: 'disconnect-platform',
                platformKey
            });
            applyServerState(data.state);
            setFeedbackOverride('ready', data.message || `${platform.label} desconectado.`, 9000);
            closePlatformModal();
        } catch (error) {
            setPlatformModalFeedback('error', getErrorMessage(error));
        } finally {
            state.isLoading = false;
            refreshProfilesSurface();
        }
    }

    async function uploadFilesWithLimit(uploads, files, limit) {
        const client = await getStorageClient();
        const results = new Array(uploads.length);
        let cursor = 0;

        async function worker() {
            while (cursor < uploads.length) {
                const currentIndex = cursor++;
                const upload = uploads[currentIndex];
                const file = files[currentIndex];

                try {
                    const { error } = await client.storage
                        .from(state.supabase.bucket)
                        .uploadToSignedUrl(upload.path, upload.token, file, {
                            contentType: file.type || 'video/mp4'
                        });

                    if (error) {
                        throw error;
                    }

                    results[currentIndex] = {
                        id: upload.id,
                        success: true
                    };
                } catch (error) {
                    results[currentIndex] = {
                        id: upload.id,
                        success: false,
                        errorMessage: getErrorMessage(error, 'Falha no upload do arquivo.')
                    };
                }
            }
        }

        const workers = Array.from({ length: Math.min(limit, uploads.length) }, () => worker());
        await Promise.all(workers);
        return results;
    }

    async function addVideosToQueue(fileList) {
        const incomingFiles = Array.from(fileList || []).filter((file) => file.type.startsWith('video/'));
        if (!incomingFiles.length) {
            setFeedbackOverride('error', 'Selecione apenas arquivos de video.', 6000);
            refreshProfilesSurface();
            return;
        }

        state.pendingUploads += incomingFiles.length;
        refreshProfilesSurface();

        try {
            const prepareResponse = await apiRequest('POST', {
                action: 'prepare-upload',
                files: incomingFiles.map((file) => ({
                    name: file.name,
                    size: file.size,
                    type: file.type
                }))
            });

            applyServerState(prepareResponse.state);
            refreshProfilesSurface();

            const uploadResults = await uploadFilesWithLimit(prepareResponse.uploads || [], incomingFiles, 2);
            const completeResponse = await apiRequest('POST', {
                action: 'complete-upload',
                uploads: uploadResults
            });

            applyServerState(completeResponse.state);
            const successCount = uploadResults.filter((result) => result.success).length;
            const failedCount = uploadResults.length - successCount;

            if (failedCount) {
                setFeedbackOverride('error', `${successCount} video(s) entraram na fila e ${failedCount} falharam no upload.`, 9000);
            } else {
                setFeedbackOverride('ready', `${successCount} video(s) adicionados a fila com sucesso.`, 7000);
            }
        } catch (error) {
            setFeedbackOverride('error', getErrorMessage(error, 'Nao foi possivel carregar os videos.'), 9000);
        } finally {
            state.pendingUploads = Math.max(0, state.pendingUploads - incomingFiles.length);
            if (videoUploadInput) {
                videoUploadInput.value = '';
            }
            refreshProfilesSurface();
        }
    }

    async function removeVideoFromQueue(videoId) {
        try {
            state.isLoading = true;
            refreshProfilesSurface();
            const data = await apiRequest('POST', {
                action: 'remove-video',
                videoId
            });
            applyServerState(data.state);
            setFeedbackOverride('ready', data.message || 'Video removido da fila.', 6000);
        } catch (error) {
            setFeedbackOverride('error', getErrorMessage(error, 'Nao foi possivel remover o video.'), 9000);
        } finally {
            state.isLoading = false;
            refreshProfilesSurface();
        }
    }

    async function clearQueue() {
        if (!state.queue.length) {
            return;
        }

        try {
            state.isLoading = true;
            refreshProfilesSurface();
            const data = await apiRequest('POST', {
                action: 'clear-queue'
            });
            applyServerState(data.state);
            setFeedbackOverride('ready', data.message || 'Fila limpa com sucesso.', 7000);
        } catch (error) {
            setFeedbackOverride('error', getErrorMessage(error, 'Nao foi possivel limpar a fila.'), 9000);
        } finally {
            state.isLoading = false;
            refreshProfilesSurface();
        }
    }

    async function publishAllVideos() {
        if (!hasPublishableQueue()) {
            setFeedbackOverride('error', 'Nao existe lote pendente para publicar.', 6000);
            refreshProfilesSurface();
            return;
        }

        state.isPublishing = true;
        refreshProfilesSurface();

        try {
            const data = await apiRequest('POST', {
                action: 'publish',
                caption: publishCaptionInput ? publishCaptionInput.value : ''
            });
            applyServerState(data.state);
            setFeedbackOverride('ready', data.message || 'Lote publicado com sucesso.', 9000);
        } catch (error) {
            setFeedbackOverride('error', getErrorMessage(error, 'Nao foi possivel disparar o lote.'), 9000);
        } finally {
            state.isPublishing = false;
            refreshProfilesSurface();
        }
    }

    if (mobileToggle) {
        mobileToggle.addEventListener('click', () => {
            sidebar.classList.toggle('active');
            const icon = mobileToggle.querySelector('i');
            icon.classList.toggle('fa-bars');
            icon.classList.toggle('fa-times');
        });
    }

    navItems.forEach((item) => {
        item.addEventListener('click', (event) => {
            event.preventDefault();

            const targetId = item.getAttribute('data-section');
            activateSection(targetId);

            if (window.innerWidth <= 992 && sidebar.classList.contains('active')) {
                sidebar.classList.remove('active');
                const icon = mobileToggle ? mobileToggle.querySelector('i') : null;
                if (icon) {
                    icon.classList.add('fa-bars');
                    icon.classList.remove('fa-times');
                }
            }
        });
    });

    document.addEventListener('click', (event) => {
        const connectButton = event.target.closest('.connect-btn');
        if (connectButton) {
            const platformKey = connectButton.getAttribute('data-platform');
            if (platformKey) {
                openPlatformModal(platformKey);
            }
            return;
        }

        const removeButton = event.target.closest('[data-remove-video]');
        if (removeButton && !state.isLoading && !state.isPublishing) {
            removeVideoFromQueue(removeButton.getAttribute('data-remove-video'));
            return;
        }

        if (event.target.matches('[data-close-platform-modal]')) {
            closePlatformModal();
        }
    });

    document.addEventListener('keydown', (event) => {
        if (event.key === 'Escape' && platformModal && !platformModal.hidden) {
            closePlatformModal();
        }
    });

    if (videoUploadInput) {
        videoUploadInput.addEventListener('change', (event) => {
            addVideosToQueue(event.target.files);
        });
    }

    if (uploadDropzone) {
        ['dragenter', 'dragover'].forEach((eventName) => {
            uploadDropzone.addEventListener(eventName, (event) => {
                event.preventDefault();
                uploadDropzone.classList.add('is-dragover');
            });
        });

        ['dragleave', 'dragend', 'drop'].forEach((eventName) => {
            uploadDropzone.addEventListener(eventName, (event) => {
                event.preventDefault();
                uploadDropzone.classList.remove('is-dragover');
            });
        });

        uploadDropzone.addEventListener('drop', (event) => {
            const files = event.dataTransfer ? event.dataTransfer.files : null;
            addVideosToQueue(files);
        });
    }

    if (clearVideosBtn) {
        clearVideosBtn.addEventListener('click', clearQueue);
    }

    if (publishAllBtn) {
        publishAllBtn.addEventListener('click', publishAllVideos);
    }

    if (disconnectPlatformBtn) {
        disconnectPlatformBtn.addEventListener('click', disconnectCurrentPlatform);
    }

    if (startConnectBtn) {
        startConnectBtn.addEventListener('click', () => {
            const platform = state.platforms[state.currentModalPlatformKey];
            if (!platform || !platform.envReady || !platform.connectUrl) {
                setPlatformModalFeedback('error', 'Essa rede ainda nao esta pronta para iniciar a autorizacao.');
                return;
            }

            window.location.href = platform.connectUrl;
        });
    }

    if (closePlatformModalBtn) {
        closePlatformModalBtn.addEventListener('click', closePlatformModal);
    }

    if (cancelPlatformBtn) {
        cancelPlatformBtn.addEventListener('click', closePlatformModal);
    }

    if (saveProfileBtn) {
        saveProfileBtn.addEventListener('click', saveProfile);
    }

    if (savePlansBtn) {
        savePlansBtn.addEventListener('click', savePlans);
    }

    readInitialRouteState();
    renderAdminState();
    refreshProfilesSurface();
    loadAdminState();
    loadProfilesState();
});
