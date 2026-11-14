export async function onRequestPost(context) {
    const { request, env } = context;

    // Logs visíveis no painel da Cloudflare (Real-time Logs)
    console.log("--- NOVA REQUISIÇÃO RECEBIDA ---");
    console.log("Headers Origin:", request.headers.get("Origin"));
    console.log("Headers Referer:", request.headers.get("Referer"));
    console.log("IP do Cliente:", request.headers.get('CF-Connecting-IP'));

    const origin = request.headers.get("Origin") || request.headers.get("Referer") || "";
    const isAllowedOrigin = origin.includes("tinkerfada.xyz") || origin.includes("lucy-red.pages.dev");
    
    if (!isAllowedOrigin) {
        console.error(`BLOQUEIO WORKER: Origin inválido -> "${origin}"`);
        return blockResponse(`Invalid Origin: ${origin}`);
    }

    if (!request.headers.get('Content-Type')?.includes('application/json')) {
        console.error("BLOQUEIO WORKER: Content-Type não é JSON.");
        return blockResponse('Invalid Content-Type');
    }

    try {
        const body = await request.json();
        console.log("Payload recebido do Front:", body);

        const ipAddress = request.headers.get('CF-Connecting-IP') || 'Unknown';
        const threatScore = request.cf?.threatScore || 0;
        console.log(`Threat Score do IP: ${threatScore}`);

        let score = 100;
        let debugReasons = [];

        if (body.honeypotValue !== '') { score = 0; debugReasons.push("Honeypot"); }
        if (!body.isMobile) { score = 0; debugReasons.push("Não é mobile"); }
        if (body.elapsedTime < 1500) { score = 0; debugReasons.push("Tempo < 1.5s"); }
        if (threatScore > 10) { score -= 50; debugReasons.push("Threat Score > 10"); }
        
        const fpRisk = evaluateFingerprint(body);
        if (fpRisk > 0) { score -= (fpRisk * 30); debugReasons.push(`Fingerprint Risk: ${fpRisk}`); }

        const finalScore = Math.max(0, Math.min(100, score));
        console.log(`Score Final Calculado: ${finalScore}. Motivos de perda:`, debugReasons.join(", ") || "Nenhum");

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

        console.log("Resposta enviada para o Front:", responseData);

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
    // Retorna o motivo detalhado para o frontend poder logar no celular!
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
    if (ua.includes('iphone') && data.platform?.toLowerCase().includes('win')) riskWeight += 1.0;
    if (!/^\d+x\d+$/.test(data.screenResolution)) riskWeight += 0.5;
    
    return riskWeight;
}
