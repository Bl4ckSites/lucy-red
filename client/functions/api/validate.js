/**
 * DIG · Premium Gate API (Cloudflare Pages Function)
 * Rota: /api/validate
 * 
 * Segurança: Mobile-Only, Honeypot, Time-Gate, Origin Check e CF Threat Score.
 */

const BOT_PATTERN_DB = {
    'headless': 1.0,
    'puppeteer': 1.0,
    'selenium': 1.0,
    'playwright': 1.0,
    'python': 1.0,
    'curl': 1.0,
    'postman': 1.0,
    'axios': 1.0,
    'node-fetch': 1.0
};

export async function onRequestPost(context) {
    const { request, env } = context;

    // ==================================================
    // CAMADA 1: PROTEÇÕES DE BORDA (Antes de ler o JSON)
    // ==================================================
    
    // 1. Origem Restrita (Aceita apenas requisições do seu domínio ou preview)
    const origin = request.headers.get("Origin") || request.headers.get("Referer") || "";
    const isAllowedOrigin = origin.includes("tinkerfada.xyz") || origin.includes("lucy-red.pages.dev");
    
    if (!isAllowedOrigin) {
        return blockResponse('Invalid Origin');
    }

    // 2. Content-Type Obrigatório
    if (!request.headers.get('Content-Type')?.includes('application/json')) {
        return blockResponse('Invalid Content-Type');
    }

    // 3. Limite de Tamanho do Payload (Evita ataques de sobrecarga)
    const contentLength = request.headers.get('Content-Length');
    if (contentLength && parseInt(contentLength) > 2048) {
        return blockResponse('Payload Too Large');
    }

    try {
        const body = await request.json();
        const ipAddress = request.headers.get('CF-Connecting-IP') || 'Unknown';
        
        // 4. Cloudflare Threat Score (Inteligência de IP da CF)
        const threatScore = request.cf?.threatScore || 0;

        // ==================================================
        // CAMADA 2: FINGERPRINT & SCORE
        // ==================================================
        let score = 100;

        // --- REGRAS DE BLOQUEIO CRÍTICO (Zeram o Score Instantaneamente) ---
        
        // Se preencheu o Honeypot -> Bot (humanos não veem o campo)
        if (body.honeypotValue !== '') score = 0;
        
        // Se não é mobile -> Bloqueio (Site estritamente Mobile-Only)
        if (!body.isMobile) score = 0;
        
        // Se o tempo na página foi muito curto (< 1.5s) -> Bot rápido
        if (body.elapsedTime < 1500) score = 0;

        // IP em Blacklist (Locais ou inválidos)
        if (isBlacklistedIP(ipAddress)) score = 0;

        // Threat Score do Cloudflare > 10 já tira 50 pontos
        if (threatScore > 10) score -= 50;
        
        // --- ANÁLISE DE PADRÕES E MISMATCH ---
        score -= (evaluateFingerprint(body) * 30);

        const finalScore = Math.max(0, Math.min(100, score));

        // ==================================================
        // CAMADA 3: DECISÃO E ENTREGA DO LINK SEGURO
        // ==================================================
        let decisionStatus;
        if (finalScore >= 85) {
            decisionStatus = 'PASS';
        } else if (finalScore >= 50) {
            decisionStatus = 'WARNING';
        } else {
            decisionStatus = 'BLOCK';
        }

        // Pega o link das Variáveis de Ambiente (O link nunca fica exposto no código)
        const secretLink = env.TELEGRAM_LINK;

        if (!secretLink) {
            console.error("ERRO CRÍTICO: Variável de ambiente TELEGRAM_LINK não configurada!");
            return blockResponse('Server Configuration Error');
        }

        // Monta a resposta
        const responseData = { 
            status: decisionStatus, 
            score: finalScore.toFixed(2),
            reason: decisionStatus === 'BLOCK' ? 'High Risk' : 'Validation OK'
        };

        // SÓ ENTREGA O LINK SE FOR PASS OU WARNING (Nunca no BLOCK)
        if (decisionStatus === 'PASS' || decisionStatus === 'WARNING') {
            responseData.link = secretLink;
        }

        // Retorno seguro com cabeçalhos restritos
        return new Response(JSON.stringify(responseData), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': isAllowedOrigin ? origin : '',
                'Cache-Control': 'no-store, no-cache, must-revalidate',
                'X-Content-Type-Options': 'nosniff'
            }
        });

    } catch (e) {
        console.error("Erro no processamento:", e);
        return blockResponse('Internal Server Error');
    }
}

// ==================================================
// FUNÇÕES DE APOIO
// ==================================================
function blockResponse(reason) {
    return new Response(JSON.stringify({ status: 'BLOCK', reason }), { 
        status: 403, 
        headers: { 'Content-Type': 'application/json' } 
    });
}

function isBlacklistedIP(ip) {
    if (ip.startsWith('192.168.') || ip.startsWith('10.') || ip === 'Unknown') return true; 
    return false;
}

function evaluateFingerprint(data) {
    let riskWeight = 0;
    const ua = data.userAgent ? data.userAgent.toLowerCase() : '';

    // 1. Ferramentas de Automação Conhecidas
    for (const [botPattern, weight] of Object.entries(BOT_PATTERN_DB)) {
        if (ua.includes(botPattern)) {
            riskWeight += weight;
        }
    }

    // 2. Mismatch de Plataforma (Diz que é iPhone mas plataforma é Win32)
    if (ua.includes('iphone') && data.platform?.toLowerCase().includes('win')) {
        riskWeight += 1.0;
    }

    // 3. Validação de Resolução Básica (Se não for formato WxH)
    if (!/^\d+x\d+$/.test(data.screenResolution)) {
        riskWeight += 0.5;
    }

    return riskWeight;
}
