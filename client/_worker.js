export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ==================================================
    // ROTA DA API (Validação)
    // ==================================================
    if (url.pathname === '/api/validate') {
      // Trata o preflight do CORS (embora same-origin não precise, é bom garantir)
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type',
          }
        });
      }

      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ status: 'BLOCK', reason: 'Method Not Allowed' }), { status: 405 });
      }

      try {
        const body = await request.json();
        console.log("Payload recebido:", body);

        const ipAddress = request.headers.get('CF-Connecting-IP') || 'Unknown';
        const threatScore = request.cf?.threatScore || 0;

        let score = 100;
        let debugReasons = [];

        // Regras de segurança
        if (body.honeypotValue !== '') { score = 0; debugReasons.push("Honeypot"); }
        if (!body.isMobile) { score = 0; debugReasons.push("Não é Mobile"); }
        if (body.elapsedTime < 10) { score = 0; debugReasons.push(`Tempo muito curto (${body.elapsedTime}ms)`); }
        
        if (threatScore > 10) { score -= 50; debugReasons.push("Threat Score alto"); }
        
        // Avaliação de Fingerprint
        const ua = body.userAgent ? body.userAgent.toLowerCase() : '';
        const bots = ['headless','puppeteer','selenium','playwright','python','curl','postman','axios','node-fetch'];
        for (const bot of bots) {
            if (ua.includes(bot)) { score -= 30; debugReasons.push(`Bot UA: ${bot}`); }
        }

        const finalScore = Math.max(0, Math.min(100, score));
        
        let decisionStatus = 'BLOCK';
        if (finalScore >= 85) decisionStatus = 'PASS';
        else if (finalScore >= 50) decisionStatus = 'WARNING';

        const secretLink = env.TELEGRAM_LINK;
        if (!secretLink) return new Response(JSON.stringify({ status: 'BLOCK', reason: 'Falta TELEGRAM_LINK' }), { status: 500 });

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
          headers: { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }
        });

      } catch (e) {
        return new Response(JSON.stringify({ status: 'BLOCK', reason: e.message }), { status: 500 });
      }
    }

    // ==================================================
    // QUALQUER OUTRA ROTA (Serve o HTML, CSS, JS normais)
    // ==================================================
    return env.ASSETS.fetch(request);
  }
};
