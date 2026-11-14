export async function onRequestPost(context) {
    const { request, env } = context;

    console.log("--- NOVA REQUISIÇÃO RECEBIDA ---");
    
    const origin = request.headers.get("Origin") || request.headers.get("Referer") || "";
    // Permite o domínio oficial e o de testes da Cloudflare
    const isAllowedOrigin = origin.includes("tinkerfada.xyz") || origin.includes("lucy-red.pages.dev");
    
    if (!isAllowedOrigin) {
        console.error(`BLOQUEIO WORKER: Origin inválido -> "${origin}"`);
        return blockResponse(`Invalid Origin: ${origin}`);
    }

    if (!request.headers.get('Content-Type')?.includes('application/json')) {
        return blockResponse('Invalid Content-Type');
    }

    try {
        const body = await request.json();
        console.log("Payload recebido do Front:", body);

        const ipAddress = request.headers.get('CF-Connecting-IP') || 'Unknown';
        const threatScore = request.cf?.threatScore || 0;

        let score = 100;
        let debugReasons = [];

        // Regras de bloqueio crítico
        if (body.honeypotValue !== '') { score = 0; debugReasons.push("Honeypot preenchido"); }
        if (!body.isMobile) { score = 0; debugReasons.push("Não é mobile"); }
        
        // --- AQUI ESTÁ A FOLGA DE SEGURANÇA (Abaixado para 10ms) ---
        if (body.elapsedTime < 10) { score = 0; debugReasons.push(`Tempo < 10ms (${body.elapsedTime}ms)`); }
        
        if (threatScore > 10) { score -= 50; debugReasons.push("Threat Score > 10"); }
        
        const fpRisk = evaluateFingerprint(body);
        if (fpRisk > 0) { score -= (fpRisk * 30); debugReasons.push(`Fingerprint Risk: ${fpRisk}`); }

        const finalScore = Math.max(0, Math.min(100, score));
        console.log(`Score Final: ${finalScore}. Motivos de perda:`, debugReasons.join(", ") || "Nenhum");

        let decisionStatus = 'BLOCK';
        if (finalScore >= 85) decisionStatus = 'PASS';
        else if (finalScore >= 50) decisionStatus = 'WARNING';

        const secretLink = env.TELEGRAM_LINK;
        if (!secretLink) {
            console.error("ERRO CRÍTICO: Variável TELEGRAM_LINK ausente.");
            return blockResponse('Server Configuration Error: Missing TELEGRAM_LINK env');
        }

        const responseData = { 
            status: decisionStatus, 
            score: finalScore.toFixed(2),
            reason: decisionStatus === 'BLOCK' ? `Score baixo (${finalScore}). Motivos: ${debugReasons.join(" | ")}` : 'Validation OK'
        };

        if (decisionStatus === 'PASS' || decisionStatus === 'WARNING') {
            responseData.link = secretLink;
        }

        console.log("Resposta enviada:", responseData);

        return new Response(JSON.stringify(responseData), {
            headers: {
                'Content-Type': 'application/json',
                'Access-Control-Allow-Origin': isAllowedOrigin ? origin : '',
                'Cache-Control': 'no-store'
            }
        });

    } catch (e) {
        console.error("Erro Crítico no Worker:", e);
        return blockResponse(`Internal Server Error: ${e.message}`);
    }
}

function blockResponse(reason) {
    return new Response(JSON.stringify({ status: 'BLOCK', reason: reason }), { 
        status: 403, 
        headers: { 'Content-Type': 'application/json' } 
    });
}

function evaluateFingerprint(data) {
    let riskWeight = 0;
    const ua = data.userAgent ? data.userAgent.toLowerCase() : '';
    const bots = ['headless','puppeteer','selenium','playwright','python','curl','postman','axios','node-fetch'];
    
    for (const bot of bots) {
        if (ua.includes(bot)) riskWeight += 1.0;
    }
    
    // Só bloqueia mismatch óbvio
    if (ua.includes('iphone') && data.platform?.toLowerCase().includes('win')) riskWeight += 1.0;
    if (!/^\d+x\d+$/.test(data.screenResolution)) riskWeight += 0.5;
    
    return riskWeight;
}
