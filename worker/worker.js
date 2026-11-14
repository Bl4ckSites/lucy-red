// --- DADOS DE CONFIANÇA ---
// 1. Database de Bots Conhecidos (Deve ser atualizado dinamicamente)
const BOT_PATTERN_DB = {
    'headless_chrome_default': 0.9, // Exemplo de padrão com alta probabilidade de bot
    'selenium_bot': 0.85
};

// 2. Regras de Geolocalização/IP (Exemplo)
const BLACKLISTED_RANGES = ['192.168.1.0/24', '10.0.0.0/8']; // IPs locais ou de teste

/**
 * Função principal que lida com todas as requisições.
 * @param {Request} request 
 * @returns {Promise<Response>}
 */
async function handleRequest(request) {
    const url = new URL(request.url);

    // ----------------------------------------------------
    // 1. ROTA DE VALIDAÇÃO API
    // ----------------------------------------------------
    if (url.pathname === '/api/validate') {
        try {
            const body = await request.json();

            // --- 1. CHECAGEM DE IP (Layer 1: Barreira Bruta) ---
            const ipAddress = request.headers.get('CF-Connecting-IP') || 'Unknown';
            if (isBlacklistedIP(ipAddress)) {
                return new Response(JSON.stringify({ status: 'BLOCK', reason: "IP Blacklisted" }), { status: 403, headers: { 'Content-Type': 'application/json' } });
            }

            // --- 2. CHECAGEM DE FINGERPRINT (Layer 2: Behavioral Analysis) ---
            let score = 100; // Começa com pontuação máxima

            // Avaliação de cada métrica
            score = score - (evaluateFingerprint(body, BOT_PATTERN_DB) * 30);

            // Pontuação final (Normalização para 0-100)
            const finalScore = Math.max(0, Math.min(100, score));

            // --- 3. DECISÃO BASEADA NO SCORE (Modelo de Risco) ---
            let decisionStatus;
            if (finalScore >= 85) {
                decisionStatus = 'PASS';
            } else if (finalScore >= 50) {
                decisionStatus = 'WARNING'; // Baixa confiança, requer plano B ou alerta
            } else {
                decisionStatus = 'BLOCK'; // Baixa pontuação, bloqueio firme
            }

            // --- 4. RETORNO PADRONIZADO ---
            return new Response(JSON.stringify({ 
                status: decisionStatus, 
                score: finalScore.toFixed(2),
                reason: decisionStatus === 'BLOCK' ? 'Alto Risco Detectado' : 'Validação OK'
            }), { 
                headers: { 'Content-Type': 'application/json' } 
            });

        } catch (e) {
            console.error("Erro no processamento da validação:", e);
            // Fallback de segurança: Se o servidor falhar, rejeita ou passa por segurança
            return new Response(JSON.stringify({ status: 'BLOCK', reason: 'Server Error' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
        }
    } 
    // ----------------------------------------------------
    // 2. ROTA DE SERVIÇO (Serve o HTML/Assets)
    // ----------------------------------------------------
    else {
        // Neste ponto, o Worker serve o index.html ou roteia para um bucket de assets.
        return new Response("Servidor de Arquivos Estáticos: Servindo index.html", { 
            headers: { 'Content-Type': 'text/html' } 
        });
    }
}

// ==================================================
// FUNÇÕES DE APOIO
// ==================================================

/**
 * Checa se o IP pertence a um range blacklist.
 * (Nota: Em produção, você precisaria de uma biblioteca de CIDR)
 */
function isBlacklistedIP(ip) {
    // Implementação simplificada:
    if (ip.startsWith('192.168.')) return true; 
    return false;
}

/**
 * Avalia o conjunto de dados do usuário contra os padrões conhecidos de bots.
 * @param {object} data - Os dados do frontend.
 * @param {object} db - Banco de dados de padrões.
 * @returns {number} - Peso de risco (quanto maior, maior o risco).
 */
function evaluateFingerprint(data, db) {
    let riskWeight = 0;

    // 1. Análise do User Agent (Matcher de String)
    if (data.userAgent && db['headless_chrome_default']) {
        const isHeadless = data.userAgent.includes('HeadlessChrome') || data.userAgent.includes('Puppeteer');
        if (isHeadless) {
            riskWeight += db['headless_chrome_default'];
        }
    }

    // 2. Análise de Resolução vs. Conhecimento de Bots
    if (data.screenResolution && /tiny|small/.test(data.screenResolution)) {
        riskWeight += 0.1; // Penalidade leve por resolução não-padrão
    }

    // 3. Análise de Canvas (Aprofundamento)
    if (data.canvasHash && db['canvas_match']) {
        // Aqui você implementaria a comparação do hash enviado contra um hash esperado
        // Se o hash for idêntico a um hash de bot conhecido -> alto peso
        riskWeight += 0.2; 
    }

    return riskWeight;
}

// Exportação padrão para Cloudflare Workers
addEventListener('fetch', event => {
    event.respondWith(handleRequest(event.request));
});