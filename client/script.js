/**
 * DIG · Premium Gate
 * ---------------------------------------------------------
 * Lógica de segurança 100% preservada.
 * Ajuste: Aguarda 3 segundos visuais antes de liberar a ação.
 */
(() => {
    'use strict';

    const CONFIG = Object.freeze({
        TELEGRAM_LINK: 'https://t.me/Lucydopriv_bot', // <-- SEU LINK
        DURATION_SECONDS: 3, // <-- Alterado para 3 segundos
        VALIDATE_ENDPOINT: '/api/validate',
        REQUEST_TIMEOUT_MS: 8000,
        AUTO_REDIRECT_DELAY_MS: 1500,
    });

    const STATUS = Object.freeze({
        PASS: 'PASS',
        WARNING: 'WARNING',
        BLOCK: 'BLOCK',
    });

    // DOM
    const byId = (id) => document.getElementById(id);
    const dom = {
        loadingArea:       byId('loading-area'),
        accessibleContent: byId('accessible-content'),
        countdownDisplay:  byId('countdown-display'),
        loadingText:       byId('loading-text'),
        accessButton:      byId('access-button'),
        hintText:          byId('hint-text'),
    };

    // Estado
    let timeLeft = CONFIG.DURATION_SECONDS;
    let countdownInterval = null;
    let hasRedirected = false;
    let isValidationComplete = false; // Flag para segurar a tela

    // ==================================================
    // 1. COLETA DE DADOS (Fingerprint)
    // ==================================================
    function getCanvasHash() { return 'SIMULATED_CANVAS_HASH_XYZ123'; }

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
    // 2. FLUXOS DE AÇÃO
    // ==================================================
    async function validateUser() {
        const browserData = collectBrowserMetrics();
        console.log('[DIG] Métricas coletadas:', browserData);

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

            const response = await fetch(CONFIG.VALIDATE_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(browserData),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            // Validação concluída, mas o timer ainda pode estar rodando.
            if (data?.status === STATUS.PASS) {
                console.log(`✅ Validação OK. Score: ${data.score}.`);
                isValidationComplete = true;
                checkAndProceed('PASS');
            } else if (data?.status === STATUS.WARNING) {
                console.warn(`⚠️ Validação em risco. Score: ${data.score}.`);
                isValidationComplete = true;
                checkAndProceed('AUTO');
            } else {
                console.error(`❌ Validação bloqueada. Score: ${data?.score}.`);
                isValidationComplete = true;
                checkAndProceed('AUTO');
            }
        } catch (error) {
            console.error('[DIG] Falha na comunicação. Fallback.', error);
            isValidationComplete = true;
            checkAndProceed('AUTO'); // Erro força o auto-redirect
        }
    }

    // ==================================================
    // 3. TIMER E SINCRONIZAÇÃO
    // ==================================================
    function updateCountdown() {
        timeLeft -= 1;
        
        // Atualiza o número na tela (vai mostrar 3, depois 2, depois 1)
        if (dom.countdownDisplay) {
            dom.countdownDisplay.textContent = Math.max(timeLeft, 0);
        }

        if (timeLeft <= 0) {
            stopCountdown();
            if (isValidationComplete) {
                // Se o timer acabou e a validação já terminou, executa a ação
                const action = window.pendingAction || 'AUTO';
                executeAction(action);
            }
        }
    }

    function stopCountdown() {
        if (countdownInterval !== null) {
            clearInterval(countdownInterval);
            countdownInterval = null;
        }
    }

    // ==================================================
    // 4. AÇÕES (Manual / Redirecionamento)
    // ==================================================
    function checkAndProceed(action) {
        window.pendingAction = action;
        
        // Se o timer já zerou, executa agora.
        // Se não, o updateCountdown vai executar quando chegar a zero.
        if (timeLeft <= 0) {
            executeAction(action);
        }
    }

    function executeAction(action) {
        if (action === 'PASS') {
            startManualInteraction();
        } else {
            startAutoRedirection();
        }
    }

    function startManualInteraction() {
        stopCountdown();

        if (dom.loadingText)      dom.loadingText.textContent      = 'Concluído';
        
        dom.loadingArea?.classList.add('hidden');
        dom.accessibleContent?.classList.remove('hidden');

        if (dom.accessButton && !dom.accessButton.dataset.bound) {
            dom.accessButton.dataset.bound = '1';
            dom.accessButton.addEventListener('click', (e) => {
                e.preventDefault();
                window.location.href = CONFIG.TELEGRAM_LINK;
            });
        }
    }

    function startAutoRedirection() {
        if (hasRedirected) return;
        hasRedirected = true;

        if (dom.countdownDisplay) dom.countdownDisplay.textContent = '...';
        if (dom.loadingText)      dom.loadingText.textContent      = 'Redirecionando...';

        setTimeout(() => {
            window.location.href = CONFIG.TELEGRAM_LINK;
        }, CONFIG.AUTO_REDIRECT_DELAY_MS);
    }

    // ==================================================
    // BOOT
    // ==================================================
    // Inicializa o número como 3 no HTML
    if (dom.countdownDisplay) dom.countdownDisplay.textContent = CONFIG.DURATION_SECONDS;
    
    countdownInterval = setInterval(updateCountdown, 1000);
    validateUser();
})();
