/**
 * DIG · Premium Gate (Frontend)
 * Coleta métricas, aplica Honeypot e Time-Gate, e aguarda o link do Worker.
 */
(() => {
    'use strict';

    const CONFIG = Object.freeze({
        DURATION_SECONDS: 3, // Tempo de carregamento visual
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
        honeypot:          byId('honeypot'), // Campo invisível anti-bot
    };

    let timeLeft = CONFIG.DURATION_SECONDS;
    let countdownInterval = null;
    let isValidationComplete = false;
    const startTime = Date.now(); // Marca o tempo de carregamento da página

    // ==================================================
    // 1. COLETA DE DADOS (Fingerprint + Anti-Bot)
    // ==================================================
    function getCanvasHash() { 
        // Pseudo-hash. Em produção, usa-se canvas real.
        return 'SIMULATED_CANVAS_HASH_XYZ123'; 
    }

    function collectBrowserMetrics() {
        // Verifica se é mobile (User Agent ou Toque na tela)
        const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent) || ('ontouchstart' in window);

        return {
            userAgent: navigator.userAgent,
            screenResolution: `${screen.width}x${screen.height}`,
            platform: navigator.platform,
            language: navigator.language,
            canvasHash: getCanvasHash(),
            isMobile: isMobile,
            honeypotValue: dom.honeypot ? dom.honeypot.value : '',
            elapsedTime: Date.now() - startTime // Tempo que o usuário demorou na tela
        };
    }

    // ==================================================
    // 2. FLUXO DE VALIDAÇÃO
    // ==================================================
    async function validateUser() {
        const browserData = collectBrowserMetrics();
        
        // Bloqueio primário no frontend (economiza requests no backend)
        // Se não for mobile, preencheu honeypot, ou foi rápido demais (< 1.5s)
        if (!browserData.isMobile || browserData.honeypotValue !== '' || browserData.elapsedTime < 1500) {
            console.warn('[DIG] Bloqueio Frontend detectado (Bot/Honeypot/Timing).');
            isValidationComplete = true;
            checkAndProceed('BLOCK');
            return;
        }

        try {
            const controller = new AbortController();
            const timeoutId = setTimeout(() => controller.abort(), CONFIG.REQUEST_TIMEOUT_MS);

            // Dispara para o Cloudflare Worker
            const response = await fetch(CONFIG.VALIDATE_ENDPOINT, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(browserData),
                signal: controller.signal,
            });
            clearTimeout(timeoutId);

            if (!response.ok) throw new Error(`HTTP ${response.status}`);

            const data = await response.json();

            if (data?.status === STATUS.PASS) {
                console.log(`✅ Validação OK. Score: ${data.score}.`);
                isValidationComplete = true;
                checkAndProceed('PASS', data.link); // O link vem do backend
            } else if (data?.status === STATUS.WARNING) {
                console.warn(`⚠️ Validação em risco. Score: ${data.score}.`);
                isValidationComplete = true;
                checkAndProceed('WARNING', data.link); 
            } else {
                console.error(`❌ Validação bloqueada pelo backend.`);
                isValidationComplete = true;
                checkAndProceed('BLOCK');
            }
        } catch (error) {
            console.error('[DIG] Falha na comunicação ou Timeout.', error);
            isValidationComplete = true;
            checkAndProceed('BLOCK');
        }
    }

    // ==================================================
    // 3. TIMER E SINCRONIZAÇÃO
    // ==================================================
    function updateCountdown() {
        timeLeft -= 1;
        if (dom.countdownDisplay) dom.countdownDisplay.textContent = Math.max(timeLeft, 0);

        if (timeLeft <= 0) {
            stopCountdown();
            if (isValidationComplete) {
                executeAction(window.pendingAction, window.pendingLink);
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
    // 4. AÇÕES FINAIS
    // ==================================================
    function checkAndProceed(action, link = null) {
        window.pendingAction = action;
        window.pendingLink = link;
        
        // Se o timer já zerou, executa agora. Se não, aguarda o timer.
        if (timeLeft <= 0) executeAction(action, link);
    }

    function executeAction(action, link) {
        if (action === 'PASS' || action === 'WARNING') {
            stopCountdown();
            if (dom.loadingText) dom.loadingText.textContent = action === 'PASS' ? 'Concluído' : 'Liberado com ressalvas';
            dom.loadingArea?.classList.add('hidden');
            dom.accessibleContent?.classList.remove('hidden');

            // Seta o link real no botão
            if (dom.accessButton && link) {
                dom.accessButton.href = link;
            }
        } else {
            // BLOCK (O bot não recebe link, a tela apenas trava/erra)
            stopCountdown();
            if (dom.countdownDisplay) dom.countdownDisplay.textContent = 'X';
            if (dom.loadingText) dom.loadingText.textContent = 'Acesso Negado.';
            
            // Opcional: Mudar a cor do card para vermelho para indicar erro
            document.querySelector('.loading-container')?.style.setProperty('border-color', 'rgba(255, 50, 50, 0.4)');
        }
    }

    // ==================================================
    // BOOT
    // ==================================================
    if (dom.countdownDisplay) dom.countdownDisplay.textContent = CONFIG.DURATION_SECONDS;
    countdownInterval = setInterval(updateCountdown, 1000);
    
    // Pequeno delay para garantir que o DOM carregou e o cara não é um bot síncrono
    setTimeout(validateUser, 100); 
})();
