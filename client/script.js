/**
 * DIG · Premium Gate
 * ---------------------------------------------------------
 * Fluxo (inalterado):
 *   1. Coleta métricas do browser (fingerprint básico)
 *   2. Envia ao backend (/api/validate)
 *   3. Decide entre:
 *        PASS    → interação manual (usuário clica)
 *        WARNING → redirecionamento automático
 *        BLOCK   → redirecionamento automático
 *        erro    → fallback (redirecionamento automático)
 *   4. Countdown visual de 5s roda em paralelo
 */
(() => {
    'use strict';

    // ==================================================
    // CONFIG (imutável, sem strings mágicas)
    // ==================================================
    const CONFIG = Object.freeze({
        TELEGRAM_LINK: 'https://t.me/Lucydopriv_bot', // <-- SUBSTITUA
        DURATION_SECONDS: 5,
        VALIDATE_ENDPOINT: '/api/validate',
        REQUEST_TIMEOUT_MS: 8000,       // aborta o fetch se o backend travar
        AUTO_REDIRECT_DELAY_MS: 1500,
    });

    const STATUS = Object.freeze({
        PASS: 'PASS',
        WARNING: 'WARNING',
        BLOCK: 'BLOCK',
    });

    // ==================================================
    // DOM — lookup null-safe (não quebra se algum id faltar)
    // ==================================================
    const byId = (id) => document.getElementById(id);
    const dom = {
        loadingArea:       byId('loading-area'),
        accessibleContent: byId('accessible-content'),
        countdownDisplay:  byId('countdown-display'),
        progressBar:       byId('progress-bar'),
        loadingText:       byId('loading-text'),
        accessButton:      byId('access-button'),
        hintText:          byId('hint-text'),
    };

    const missingIds = Object.entries(dom)
        .filter(([, el]) => !el)
        .map(([key]) => key);
    if (missingIds.length) {
        console.warn('[DIG] Elementos ausentes no DOM:', missingIds);
    }

    // ==================================================
    // ESTADO
    // ==================================================
    let timeLeft = CONFIG.DURATION_SECONDS;
    let countdownInterval = null;  // declarado ANTES de ser usado
    let hasRedirected = false;     // idempotência do redirect

    // ==================================================
    // 1. COLETA DE DADOS (fingerprint)
    // ==================================================
    function getCanvasHash() {
        // Pseudo-implementação. Substituir por fingerprint real
        // (render no canvas + SHA-256 das operações).
        return 'SIMULATED_CANVAS_HASH_XYZ123';
    }

    function collectBrowserMetrics() {
        return {
            userAgent: navigator.userAgent,
            screenResolution: `${screen.width}x${screen.height}`,
            platform: navigator.platform,
            language: navigator.language,
            canvasHash: getCanvasHash(),
        };
    }

    // ==================================================
    // 2. FLUXOS
    // ==================================================
    async function validateUser() {
        const browserData = collectBrowserMetrics();
        console.log('[DIG] Métricas coletadas:', browserData);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(
                () => controller.abort(),
                CONFIG.REQUEST_TIMEOUT_MS
            );

            const response = await fetch(CONFIG.VALIDATE_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(browserData),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            // Se o backend responder erro HTTP, cai no catch → fallback.
            if (!response.ok) {
                throw new Error(`HTTP ${response.status} ${response.statusText}`);
            }

            const data = await response.json();

            // Mesma árvore de decisão do original:
            if (data?.status === STATUS.PASS) {
                console.log(`✅ Validação OK. Score: ${data.score}. Interação manual.`);
                startManualInteraction();
            } else if (data?.status === STATUS.WARNING) {
                console.warn(`⚠️ Validação em risco. Score: ${data.score}. Auto-redirect.`);
                startAutoRedirection();
            } else {
                // BLOCK ou status desconhecido → plano B forte
                console.error(`❌ Validação bloqueada/desconhecida. Score: ${data?.score}. Auto-redirect.`);
                startAutoRedirection();
            }
        } catch (error) {
            console.error('[DIG] Falha na comunicação com o backend. Fallback.', {
                name: error?.name,
                message: error?.message,
            });
            startAutoRedirection();
        }
    }

    function startManualInteraction() {
        stopCountdown();

        if (dom.loadingText)      dom.loadingText.textContent      = 'Verificação completa. Pronto para entrar!';
        if (dom.countdownDisplay) dom.countdownDisplay.textContent = 'VERIFICADO';
        if (dom.progressBar)      dom.progressBar.style.width      = '100%';

        dom.loadingArea?.classList.add('hidden');
        dom.accessibleContent?.classList.remove('hidden');

        // Evita binding duplicado caso a função seja chamada mais de uma vez
        if (dom.accessButton && !dom.accessButton.dataset.bound) {
            dom.accessButton.dataset.bound = '1';
            dom.accessButton.addEventListener('click', () => {
                window.location.href = CONFIG.TELEGRAM_LINK;
            });
        }
    }

    function startAutoRedirection() {
        if (hasRedirected) return;   // guard: só dispara uma vez
        hasRedirected = true;

        if (dom.loadingText)      dom.loadingText.textContent      = 'Falha na Verificação. Redirecionando automaticamente...';
        if (dom.countdownDisplay) dom.countdownDisplay.textContent = 'AUTO-REDIRECT';
        if (dom.progressBar)      dom.progressBar.style.width      = '100%';

        setTimeout(() => {
            window.location.href = CONFIG.TELEGRAM_LINK;
        }, CONFIG.AUTO_REDIRECT_DELAY_MS);
    }

    // ==================================================
    // 3. TIMER / UI
    // ==================================================
    function stopCountdown() {
        if (countdownInterval !== null) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }

    function updateCountdown() {
        timeLeft -= 1;
        const safeTime = Math.max(timeLeft, 0);

        if (dom.countdownDisplay) {
            dom.countdownDisplay.textContent = `⏳ ${safeTime}s`;
        }

        if (dom.progressBar) {
            const progressPercentage =
                ((CONFIG.DURATION_SECONDS - safeTime) / CONFIG.DURATION_SECONDS) * 100;
            dom.progressBar.style.width = `${progressPercentage}%`;
        }

        if (timeLeft <= 0) stopCountdown();
    }

    // ==================================================
    // BOOT
    // ==================================================
    countdownInterval = setInterval(updateCountdown, 1000);
    validateUser();
})();