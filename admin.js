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

    const platformState = {
        instagram: { label: 'Instagram', handle: '@eujujuqueiroz.reels', connected: false },
        tiktok: { label: 'TikTok', handle: '@eujujuqueiroz.clips', connected: false },
        youtube: { label: 'YouTube', handle: 'youtube.com/@eujujuqueiroz', connected: false },
        x: { label: 'X', handle: '@eujujuqueirozx', connected: false },
        threads: { label: 'Threads', handle: '@eujujuqueiroz.threads', connected: false }
    };

    const state = {
        videos: [],
        logs: [],
        isPublishing: false
    };

    let nextVideoId = 1;

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

    function formatRunTime(date) {
        return new Intl.DateTimeFormat('pt-BR', {
            hour: '2-digit',
            minute: '2-digit',
            day: '2-digit',
            month: '2-digit'
        }).format(date);
    }

    function getConnectedPlatforms() {
        return Object.entries(platformState)
            .filter(([, platform]) => platform.connected)
            .map(([key, platform]) => ({ key, ...platform }));
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

    function updateProfilesSummary() {
        const connectedPlatforms = getConnectedPlatforms();
        const deliveryCount = connectedPlatforms.length * state.videos.length;

        if (connectedCount) {
            connectedCount.textContent = `${connectedPlatforms.length}/5`;
        }

        if (queuedVideosCount) {
            queuedVideosCount.textContent = String(state.videos.length);
        }

        if (distributionCount) {
            distributionCount.textContent = String(deliveryCount);
        }

        if (activeDestinations) {
            activeDestinations.textContent = connectedPlatforms.length
                ? connectedPlatforms.map(platform => platform.label).join(', ')
                : 'Nenhuma rede conectada';
        }

        if (publishReadyState) {
            if (!state.videos.length) {
                publishReadyState.textContent = 'Aguardando videos';
            } else if (!connectedPlatforms.length) {
                publishReadyState.textContent = 'Conecte redes para publicar';
            } else if (state.isPublishing) {
                publishReadyState.textContent = 'Publicando lote atual';
            } else {
                publishReadyState.textContent = `${state.videos.length} videos prontos`;
            }
        }

        if (queueMeta) {
            queueMeta.textContent = `${state.videos.length} arquivo(s) carregados`;
        }

        if (!state.isPublishing) {
            if (!connectedPlatforms.length && !state.videos.length) {
                setProfilesFeedback('info', 'Conecte ao menos uma rede e adicione videos para disparar a publicacao em lote.');
            } else if (!connectedPlatforms.length) {
                setProfilesFeedback('error', 'Existem videos na fila, mas nenhuma rede conectada.');
            } else if (!state.videos.length) {
                setProfilesFeedback('info', 'As redes ja estao conectadas. Agora basta selecionar os videos.');
            } else {
                setProfilesFeedback('ready', `${state.videos.length} video(s) preparados para ${deliveryCount} distribuicoes.`);
            }
        }
    }

    function renderPlatformState() {
        document.querySelectorAll('.platform-row').forEach((row) => {
            const platformKey = row.getAttribute('data-platform');
            const platform = platformState[platformKey];
            if (!platform) {
                return;
            }

            const handle = row.querySelector('.platform-handle');
            const badge = row.querySelector('.connection-badge');
            const button = row.querySelector('.btn-platform');

            row.classList.toggle('is-connected', platform.connected);
            handle.textContent = platform.connected ? platform.handle : 'Nao conectado';

            badge.classList.toggle('connected', platform.connected);
            badge.classList.toggle('disconnected', !platform.connected);
            badge.textContent = platform.connected ? 'Conectado' : 'Desconectado';

            button.classList.toggle('is-connected', platform.connected);
            button.textContent = platform.connected ? 'Desconectar' : 'Conectar';
        });

        updateProfilesSummary();
        renderVideoQueue();
    }

    function renderVideoQueue() {
        if (!videoQueue) {
            return;
        }

        const connectedPlatforms = getConnectedPlatforms();

        if (!state.videos.length) {
            videoQueue.classList.add('empty');
            videoQueue.innerHTML = `
                <div class="empty-state">
                    <i class="fas fa-photo-film"></i>
                    <p>Nenhum video carregado ainda.</p>
                </div>
            `;
            return;
        }

        videoQueue.classList.remove('empty');
        videoQueue.innerHTML = state.videos.map((video) => {
            const statusMap = {
                ready: { label: 'Pronto', className: 'ready' },
                publishing: { label: 'Publicando', className: 'publishing' },
                done: { label: 'Publicado', className: 'done' }
            };
            const currentStatus = statusMap[video.status] || statusMap.ready;
            const chips = connectedPlatforms.length
                ? connectedPlatforms.map((platform) => `<span class="queue-chip">${escapeHtml(platform.label)}</span>`).join('')
                : '<span class="queue-chip">Sem destinos conectados</span>';

            return `
                <article class="queue-item" data-video-id="${escapeHtml(video.id)}">
                    <div class="queue-item-main">
                        <div class="queue-item-top">
                            <span class="queue-item-title">${escapeHtml(video.name)}</span>
                            <span class="queue-status ${currentStatus.className}">${currentStatus.label}</span>
                        </div>
                        <div class="queue-item-subtitle">${escapeHtml(formatBytes(video.size))} • ${connectedPlatforms.length} destino(s) por disparo</div>
                        <div class="queue-chip-row">${chips}</div>
                    </div>
                    <div class="queue-item-actions">
                        <button type="button" class="queue-remove" data-remove-video="${escapeHtml(video.id)}" aria-label="Remover video">
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
        publishLog.innerHTML = state.logs.map((log) => `
            <article class="publish-log-item">
                <div>
                    <strong>${escapeHtml(log.title)}</strong>
                    <span>${escapeHtml(log.summary)}</span>
                </div>
                <span class="queue-status done">${escapeHtml(log.timestamp)}</span>
            </article>
        `).join('');
    }

    function syncPublishingButtons() {
        if (publishAllBtn) {
            publishAllBtn.disabled = state.isPublishing;
            publishAllBtn.textContent = state.isPublishing ? 'Publicando...' : 'Publicar em 1 clique';
        }

        if (clearVideosBtn) {
            clearVideosBtn.disabled = state.isPublishing || !state.videos.length;
        }

        if (videoUploadInput) {
            videoUploadInput.disabled = state.isPublishing;
        }
    }

    function addVideosToQueue(fileList) {
        const incomingFiles = Array.from(fileList || []);
        if (!incomingFiles.length) {
            return;
        }

        const newVideos = incomingFiles.map((file) => ({
            id: `video-${nextVideoId++}`,
            name: file.name,
            size: file.size,
            status: 'ready'
        }));

        state.videos = [...state.videos, ...newVideos];
        if (videoUploadInput) {
            videoUploadInput.value = '';
        }

        renderVideoQueue();
        updateProfilesSummary();
        syncPublishingButtons();
    }

    function removeVideoFromQueue(videoId) {
        state.videos = state.videos.filter((video) => video.id !== videoId);
        renderVideoQueue();
        updateProfilesSummary();
        syncPublishingButtons();
    }

    async function publishAllVideos() {
        const connectedPlatforms = getConnectedPlatforms();

        if (!connectedPlatforms.length) {
            setProfilesFeedback('error', 'Conecte ao menos uma rede antes de publicar.');
            return;
        }

        if (!state.videos.length) {
            setProfilesFeedback('error', 'Adicione ao menos um video para iniciar a publicacao em lote.');
            return;
        }

        state.isPublishing = true;
        state.videos = state.videos.map((video) => ({ ...video, status: 'publishing' }));
        syncPublishingButtons();
        renderVideoQueue();
        updateProfilesSummary();

        const totalDeliveries = state.videos.length * connectedPlatforms.length;
        setProfilesFeedback('info', `Disparando ${state.videos.length} video(s) para ${connectedPlatforms.map((platform) => platform.label).join(', ')}.`);

        await new Promise((resolve) => setTimeout(resolve, 1200));

        state.videos = state.videos.map((video) => ({ ...video, status: 'done' }));
        state.isPublishing = false;

        const publishedAt = new Date();
        const timestamp = formatRunTime(publishedAt);
        const logEntry = {
            title: `${state.videos.length} video(s) enviados para ${connectedPlatforms.length} rede(s)`,
            summary: `${totalDeliveries} distribuicoes feitas em lote para ${connectedPlatforms.map((platform) => platform.label).join(', ')}.`,
            timestamp
        };

        state.logs.unshift(logEntry);
        if (profilesLastRun) {
            profilesLastRun.textContent = timestamp;
        }

        renderVideoQueue();
        renderPublishLog();
        updateProfilesSummary();
        syncPublishingButtons();
        setProfilesFeedback('ready', `${state.videos.length} video(s) publicados com sucesso em ${totalDeliveries} distribuicoes.`);
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

            navItems.forEach((nav) => nav.classList.remove('active'));
            item.classList.add('active');

            const targetId = item.getAttribute('data-section');
            sections.forEach((section) => {
                section.style.display = section.id === targetId ? 'block' : 'none';
            });

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
            if (platformState[platformKey]) {
                platformState[platformKey].connected = !platformState[platformKey].connected;
                renderPlatformState();
                syncPublishingButtons();
            }
            return;
        }

        const removeButton = event.target.closest('[data-remove-video]');
        if (removeButton && !state.isPublishing) {
            removeVideoFromQueue(removeButton.getAttribute('data-remove-video'));
        }
    });

    if (videoUploadInput) {
        videoUploadInput.addEventListener('change', (event) => {
            addVideosToQueue(event.target.files);
        });
    }

    if (clearVideosBtn) {
        clearVideosBtn.addEventListener('click', () => {
            if (state.isPublishing) {
                return;
            }

            state.videos = [];
            renderVideoQueue();
            updateProfilesSummary();
            syncPublishingButtons();
        });
    }

    if (publishAllBtn) {
        publishAllBtn.addEventListener('click', publishAllVideos);
    }

    const profileForm = document.getElementById('profile-form');
    if (profileForm) {
        const profileButton = profileForm.querySelector('button');
        if (profileButton) {
            profileButton.addEventListener('click', () => {
                alert('Perfil atualizado com sucesso!');
            });
        }
    }

    const savePlansBtn = document.getElementById('save-plans');
    if (savePlansBtn) {
        savePlansBtn.addEventListener('click', () => {
            const plans = [
                { id: '1-month', name: document.querySelector('.plan-name[data-plan="1-month"]').value, price: document.querySelector('.plan-price[data-plan="1-month"]').value },
                { id: '3-month', name: document.querySelector('.plan-name[data-plan="3-month"]').value, price: document.querySelector('.plan-price[data-plan="3-month"]').value },
                { id: '6-month', name: document.querySelector('.plan-name[data-plan="6-month"]').value, price: document.querySelector('.plan-price[data-plan="6-month"]').value }
            ];

            alert('Planos sincronizados com a pagina de checkout!');
            console.log('Novos planos:', plans);
        });
    }

    renderPlatformState();
    renderPublishLog();
    syncPublishingButtons();
});
