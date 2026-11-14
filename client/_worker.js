export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    if (url.pathname === '/api/validate') {
      
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Accept',
          }
        });
      }

      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ status: 'BLOCK', reason: 'Method Not Allowed' }), { 
          status: 405, 
          headers: { 'Content-Type': 'application/json' } 
        });
      }

      try {
        const rawBody = await request.text();
        let body;
        try { body = JSON.parse(rawBody); } catch (parseError) {
          return blockResponse('Invalid JSON Payload');
        }

        const ipAddress = request.headers.get('CF-Connecting-IP') || 'Unknown';
        const threatScore = request.cf?.threatScore || 0;

        let score = 100;
        let debugReasons = [];

        // Regras de bloqueio
        if (body.honeypotValue && body.honeypotValue.trim() !== '') { 
            score = 0; 
            debugReasons.push("Honeypot"); 
        }
        if (!body.isMobile) { 
            score = 0; 
            debugReasons.push("Não é Mobile"); 
        }
        
        if (threatScore > 10) { 
            score -= 50; 
            debugReasons.push("Threat Score"); 
        }
        
        const ua = body.userAgent ? body.userAgent.toLowerCase() : '';
        const bots = ['headless','puppeteer','selenium','playwright','python','curl','postman','axios','node-fetch'];
        for (const bot of bots) {
            if (ua.includes(bot)) { 
                score -= 30; 
                debugReasons.push(`UA Bot: ${bot}`); 
            }
        }

        const finalScore = Math.max(0, Math.min(100, score));
        let decisionStatus = finalScore >= 85 ? 'PASS' : (finalScore >= 50 ? 'WARNING' : 'BLOCK');

        // ==================================================
        // A MÁGICA DO LINK ACONTECE AQUI
        // ==================================================
        const rawLink = env.TELEGRAM_LINK || '';
        // Remove QUALQUER espaço, quebra de linha ou caractere invisível que o Cloudflare inseriu
        const secretLink = rawLink.trim().replace(/\s/g, ''); 
        
        if (!secretLink) {
            return blockResponse('Missing TELEGRAM_LINK env');
        }

        const responseData = { 
            status: decisionStatus, 
            score: finalScore.toFixed(2),
            reason: decisionStatus === 'BLOCK' ? `Score baixo (${finalScore}). Motivos: ${debugReasons.join(" | ")}` : 'Validation OK'
        };

        if (decisionStatus === 'PASS' || decisionStatus === 'WARNING') {
            responseData.link = secretLink; // Link 100% limpo
        }

        return new Response(JSON.stringify(responseData), {
          headers: { 
              'Content-Type': 'application/json', 
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-store' 
          }
        });

      } catch (e) {
        return blockResponse(`Internal Error: ${e.message}`);
      }
    }

    // Serve o site normal
    return env.ASSETS.fetch(request);
  }
};

function blockResponse(reason) {
  return new Response(JSON.stringify({ status: 'BLOCK', reason: reason }), { 
    status: 403, 
    headers: { 'Content-Type': 'application/json', 'Access-Control-Allow-Origin': '*' } 
  });
}
