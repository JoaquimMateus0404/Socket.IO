// Exemplo de como PODERIA ser adaptado para Vercel (não recomendado)
// Este seria um exemplo usando Server-Sent Events ao invés de WebSockets

import { Redis } from '@upstash/redis'

const redis = new Redis({
  url: process.env.UPSTASH_REDIS_REST_URL,
  token: process.env.UPSTASH_REDIS_REST_TOKEN,
})

// API Route para receber mensagens
export default async function handler(req, res) {
  if (req.method === 'POST') {
    const { message, userId, username } = req.body;
    
    // Salvar mensagem no Redis
    await redis.lpush('messages', JSON.stringify({
      message,
      userId,
      username,
      timestamp: new Date().toISOString()
    }));
    
    res.status(200).json({ success: true });
  }
  
  // SSE para receber mensagens em tempo real
  else if (req.method === 'GET') {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    
    // Polling do Redis a cada 1 segundo
    const interval = setInterval(async () => {
      const messages = await redis.lrange('messages', 0, 10);
      res.write(`data: ${JSON.stringify(messages)}\n\n`);
    }, 1000);
    
    // Cleanup quando conexão fechar
    req.on('close', () => {
      clearInterval(interval);
    });
  }
}
