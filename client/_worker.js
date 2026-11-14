export default {
  async fetch(request, env, ctx) {
    const url = new URL(request.url);

    // ==================================================
    // ROTA DA API (Validação)
    // ==================================================
    if (url.pathname === '/api/validate') {
      
      // 1. Tratamento de CORS (Preflight OPTIONS)
      if (request.method === 'OPTIONS') {
        return new Response(null, {
          headers: {
            'Access-Control-Allow-Origin': '*',
            'Access-Control-Allow-Methods': 'POST, OPTIONS',
            'Access-Control-Allow-Headers': 'Content-Type, Accept',
          }
        });
      }

      // 2. Garante que só aceita POST
      if (request.method !== 'POST') {
        return new Response(JSON.stringify({ status: 'BLOCK', reason: 'Method Not Allowed' }), { 
          status: 405, 
          headers: { 'Content-Type': 'application/json' } 
        });
      }

      try {
        // 3. Leitura do Payload (O Segredo das 3 Camadas)
        // Lemos o body como TEXTO puro. Isso funciona para 'application/json', 'text/plain' e 'urlencoded'.
        const rawBody = await request.text();
        let body;

        try {
          // Tenta converter o texto para JSON. Como o script.js usa JSON.stringify em todas as camadas, isso sempre vai funcionar.
          body = JSON.parse(rawBody);
        } catch (parseError) {
          console.error("BLOQUEIO WORKER: Payload não é um JSON válido.", rawBody);
          return blockResponse('Invalid JSON Payload');
        }

        console.log("--- NOVA REQUISIÇÃO RECEBIDA ---");
        console.log("Payload processado:", body);

        // ==================================================
        // CAMADA DE SEGURANÇA E SCORE
        // ==================================================
        const ipAddress = request.headers.get('CF-Connecting-IP') || 'Unknown';
        const threatScore = request.cf?.threatScore || 0;

        let score = 100;
        let debugReasons = [];

        // 3.1 Regras de Bloqueio Crítico
        if (body.honeypotValue !== '') { 
            score = 0; 
            debugReasons.push("Honeypot preenchido"); 
        }
        if (!body.isMobile) { 
            score = 0; 
            debugReasons.push("Não é Mobile"); 
        }
        if (body.elapsedTime < 10) { 
            score = 0; 
            debugReasons.push(`Tempo muito curto (${body.elapsedTime}ms)`); 
        }
        
        // 3.2 Análise de Risco Cloudflare
        if (threatScore > 10) { 
            score -= 50; 
            debugReasons.push(`Cloudflare Threat Score Alto (${threatScore})`); 
        }
        
        // 3.3 Análise de Fingerprint (User Agent)
        const ua = body.userAgent ? body.userAgent.toLowerCase() : '';
        const bots = ['headless','puppeteer','selenium','playwright','python','curl','postman','axios','node-fetch'];
        for (const bot of bots) {
            if (ua.includes(bot)) { 
                score -= 30; 
                debugReasons.push(`Assinatura de Bot: ${bot}`); 
            }
        }

        // 3.4 Validação de Resolução
        if (!/^\d+x\d+$/.test(body.screenResolution)) {
            score -= 10;
            debugReasons.push("Resolução Inválida");
        }

        const finalScore = Math.max(0, Math.min(100, score));
        console.log(`Score Final: ${finalScore}. Motivos de perda:`, debugReasons.join(", ") || "Nenhum");
        
        // 4. Decisão
        let decisionStatus = 'BLOCK';
        if (finalScore >= 85) decisionStatus = 'PASS';
        else if (finalScore >= 50) decisionStatus = 'WARNING';

        // 5. Pega a Variável de Ambiente (O Link Secreto)
        const secretLink = env.TELEGRAM_LINK;
        if (!secretLink) {
            console.error("ERRO CRÍTICO: Variável TELEGRAM_LINK não configurada!");
            return blockResponse('Server Configuration Error');
        }

        // 6. Monta a Resposta
        const responseData = { 
            status: decisionStatus, 
            score: finalScore.toFixed(2),
            reason: decisionStatus === 'BLOCK' ? `Acesso Negado (Score: ${finalScore}). Motivos: ${debugReasons.join(" | ")}` : 'Validation OK'
        };

        // SÓ ENTREGA O LINK SE FOR PASS OU WARNING (Nunca no BLOCK)
        if (decisionStatus === 'PASS' || decisionStatus === 'WARNING') {
            responseData.link = secretLink;
        }

        console.log("Resposta enviada:", responseData);

        return new Response(JSON.stringify(responseData), {
          headers: { 
              'Content-Type': 'application/json', 
              'Access-Control-Allow-Origin': '*',
              'Cache-Control': 'no-store' 
          }
        });

      } catch (e) {
        console.error("Erro Crítico no Worker:", e);
        return blockResponse(`Internal Server Error: ${e.message}`);
      }
    }

    // ==================================================
    // QUALQUER OUTRA ROTA (Serve o HTML, CSS, JS normais)
    // ==================================================
    // Se não for a rota da API, entrega os arquivos da pasta 'client'
    return env.ASSETS.fetch(request);
  }
};

/**
 * Função auxiliar para padronizar respostas de erro/bloqueio
 */
function blockResponse(reason) {
  return new Response(JSON.stringify({ status: 'BLOCK', reason: reason }), { 
    status: 403, 
    headers: { 
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*'
    } 
  });
}
