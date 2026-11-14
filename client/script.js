/**
 * DIG · Premium Gate (Frontend - Ajuste de Tempo Seguro)
 */
(() => {
    'use strict';

    // Mude para false quando terminar todos os testes!
    const DEBUG_MODE = true; 

    const CONFIG = Object.freeze({
        DURATION_SECONDS: 3,
        VALIDATE_ENDPOINT: '/api/validate',
        REQUEST_TIMEOUT_MS: 8000,
        AUTO_REDIRECT_DELAY_MS: 1500,
    });

    const STATUS = Object.freeze({ PASS: 'PASS', WARNING: 'WARNING', BLOCK: 'BLOCK' });
    const byId = (id) => document.getElementById(id);
    
    const dom = {
        loadingArea:       byId('loading-area'),
        accessibleContent: byId('accessible-content'),
        countdownDisplay:  byId('countdown-display'),
        loadingText:       byId('loading-text'),
        accessButton:      byId('access-button'),
        honeypot:          byId('honeypot'),
    };

    let timeLeft = CONFIG.DURATION_SECONDS;
    let countdownInterval = null;
    let isValidationComplete = false;
    const startTime = Date.now(); 

    function log(msg, data = null) {
        if (DEBUG_MODE) {
            console.log(`[DIG-DEBUG] ${msg}`, data ? data : '');
        }
    }

    function collectBrowserMetrics() {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || ('ontouchstart' in window);
        const elapsed = Date.now() - startTime;
        
        const data = {
            userAgent: navigator.userAgent,
            screenResolution: `${screen.width}x${screen.height}`,
            platform: navigator.platform,
            language: navigator.language,
            canvasHash: 'SIMULATED_CANVAS_HASH_XYZ123',
            isMobile: isMobile,
            honeypotValue: dom.honeypot ? dom.honeypot.value : '',
            elapsedTime: elapsed
        };

        log("Métricas coletadas no Front:", data);
        return data;
    }

    async function validateUser() {
        const browserData = collectBrowserMetrics();
        
        // --- AQUI ESTÁ A FOLGA DE SEGURANÇA ---
        // Mudamos de 1500ms para 200ms. 
        // Bots: < 50ms. Celulares reais: > 250ms.
        if (!browserData.isMobile) log("BLOQUEIO FRONT: Não é mobile.");
        if (browserData.honeypotValue !== '') log("BLOQUEIO FRONT: Honeypot preenchido.");
        if (browserData.elapsedTime < 200) log(`BLOQUEIO FRONT: Tempo muito curto (${browserData.elapsedTime}ms).`);

        if (!browserData.isMobile || browserData.honeypotValue !== '' || browserData.elapsedTime < 200) {
            isValidationComplete = true;
            checkAndProceed('BLOCK');
            return;
        }

        try {
            log(`Enviando fetch para ${CONFIG.VALIDATE_ENDPOINT}...`);
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

            const response = await fetch(CONFIG.VALIDATE_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(browserData),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            log(`Resposta recebida. Status HTTP: ${response.status}`);

            if (!response.ok) {
                const errorText = await response.text();
                log("ERRO DO BACKEND (Response não-OK):", errorText);
                throw new Error(`HTTP ${response.status}: ${errorText}`);
            }

            const data = await response.json();
            log("JSON recebido do Worker:", data);

            if (data?.status === STATUS.PASS) {
                isValidationComplete = true;
                checkAndProceed('PASS', data.link); 
            } else if (data?.status === STATUS.WARNING) {
                isValidationComplete = true;
                checkAndProceed('WARNING', data.link); 
            } else {
                log(`Backend retornou BLOCK. Motivo: ${data.reason || 'Não especificado'}`);
                isValidationComplete = true;
                checkAndProceed('BLOCK');
            }
        } catch (error) {
            log("FALHA NO FETCH/CATCH:", error.message);
            console.error(error); 
            isValidationComplete = true;
            checkAndProceed('BLOCK');
        }
    }

    function updateCountdown() {
        timeLeft -= 1;
        if (dom.countdownDisplay) dom.countdownDisplay.textContent = Math.max(timeLeft, 0);
        if (timeLeft <= 0) {
            stopCountdown();
            if (isValidationComplete) executeAction(window.pendingAction, window.pendingLink);
        }
    }

    function stopCountdown() {
        if (countdownInterval !== null) { clearInterval(countdownInterval); countdownInterval = null; }
    }

    function checkAndProceed(action, link = null) {
        window.pendingAction = action;
        window.pendingLink = link;
        if (timeLeft <= 0) executeAction(action, link);
    }

    function executeAction(action, link) {
        log(`Executando Ação Final: ${action}`);
        if (action === 'PASS' || action === 'WARNING') {
            stopCountdown();
            if (dom.loadingText) dom.loadingText.textContent = 'Concluído';
            dom.loadingArea?.classList.add('hidden');
            dom.accessibleContent?.classList.remove('hidden');
            if (dom.accessButton && link) dom.accessButton.href = link;
        } else {
            stopCountdown();
            if (dom.countdownDisplay) dom.countdownDisplay.textContent = 'X';
            if (dom.loadingText) dom.loadingText.textContent = 'Acesso Negado.';
            document.querySelector('.loading-container')?.style.setProperty('border-color', 'rgba(255, 50, 50, 0.4)');
        }
    }

    if (dom.countdownDisplay) dom.countdownDisplay.textContent = CONFIG.DURATION_SECONDS;
    countdownInterval = setInterval(updateCountdown, 1000);
    
    // Delay de 100ms para o DOM carregar. Somado aos 200ms da validação, temos 300ms totais de margem.
    setTimeout(validateUser, 100); 
})();
