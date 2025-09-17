const express = require('express');
const http = require('http');
const WebSocket = require('ws');
const path = require('path');
const { v4: uuidv4 } = require('uuid');

const app = express();
const server = http.createServer(app);

// Criar servidor WebSocket
const wss = new WebSocket.Server({ 
  server,
  path: '/ws'
});

// Middleware para JSON
app.use(express.json());

// Servir arquivos estáticos (se necessário)
app.use(express.static(path.join(__dirname, 'public')));

// Lista de usuários conectados (agora incluindo dados do NotiChat)
let connectedUsers = new Map();
// Map para associar userId do sistema com clientId do WebSocket
let userToClientMap = new Map();
// Map para associar clientId com userId do sistema
let clientToUserMap = new Map();

// Função para broadcast para todos os clientes
function broadcast(data, excludeWs = null) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      client.send(message);
    }
  });
}

// Função para broadcast para usuários específicos em uma conversa
function broadcastToConversation(conversationId, data, excludeWs = null) {
  const message = JSON.stringify(data);
  wss.clients.forEach(client => {
    if (client !== excludeWs && client.readyState === WebSocket.OPEN) {
      // Aqui você pode adicionar lógica para verificar se o usuário faz parte da conversa
      client.send(message);
    }
  });
}

// Função para enviar mensagem para um cliente específico
function sendToClient(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

// Função para enviar mensagem para um usuário específico pelo userId
function sendToUser(userId, data) {
  const clientId = userToClientMap.get(userId);
  if (clientId) {
    const client = Array.from(wss.clients).find(c => c.clientId === clientId);
    if (client) {
      sendToClient(client, data);
    }
  }
}

// Eventos do WebSocket
wss.on('connection', (ws) => {
  const clientId = uuidv4();
  ws.clientId = clientId;
  
  console.log(`Cliente conectado: ${clientId}`);

  // Enviar confirmação de conexão
  sendToClient(ws, {
    type: 'connection_established',
    clientId: clientId
  });

  ws.on('message', (data) => {
    try {
      const message = JSON.parse(data);
      
      switch (message.type) {
        case 'user_connect':
        case 'user_join':
          handleUserConnect(ws, message);
          break;
          
        case 'message':
        case 'chat_message':
          handleChatMessage(ws, message);
          break;
          
        case 'typing':
        case 'typing_start':
          handleTypingStart(ws, message);
          break;
          
        case 'stop_typing':
        case 'typing_stop':
          handleTypingStop(ws, message);
          break;
          
        case 'reaction':
        case 'custom_event':
          handleReaction(ws, message);
          break;
          
        case 'message_read':
          handleMessageRead(ws, message);
          break;
          
        default:
          console.log('Tipo de mensagem desconhecido:', message.type);
      }
    } catch (error) {
      console.error('Erro ao processar mensagem:', error);
      sendToClient(ws, {
        type: 'error',
        message: 'Erro ao processar mensagem'
      });
    }
  });

  ws.on('close', () => {
    handleDisconnection(ws);
  });

  ws.on('error', (error) => {
    console.error('Erro no WebSocket:', error);
  });
});

// Handlers adaptados para o NotiChat
function handleUserConnect(ws, message) {
  const userData = {
    clientId: ws.clientId,
    userId: message.data?.userId || message.userId,
    username: message.data?.username || message.username,
    name: message.data?.name || message.name,
    joinTime: new Date()
  };
  
  // Armazenar dados do usuário
  connectedUsers.set(ws.clientId, userData);
  ws.userData = userData;
  
  // Mapear userId para clientId
  if (userData.userId) {
    userToClientMap.set(userData.userId, ws.clientId);
    clientToUserMap.set(ws.clientId, userData.userId);
  }
  
  console.log(`${userData.username || userData.name} (${userData.userId}) conectado como ${ws.clientId}`);
  
  // Notificar outros usuários sobre o usuário online
  broadcast({
    type: 'user_online',
    data: {
      userId: userData.userId,
      username: userData.username,
      name: userData.name
    }
  }, ws);
  
  // Enviar lista de usuários online para o usuário recém conectado
  const onlineUsers = Array.from(connectedUsers.values()).map(user => ({
    userId: user.userId,
    username: user.username,
    name: user.name,
    clientId: user.clientId
  }));
  
  sendToClient(ws, {
    type: 'users_online',
    users: onlineUsers
  });
  
  // Atualizar lista de usuários para todos
  broadcast({
    type: 'update_users',
    users: onlineUsers
  });
}

function handleChatMessage(ws, message) {
  const user = connectedUsers.get(ws.clientId);
  if (!user) return;
  
  const conversationId = message.conversationId;
  const messageData = message.data || message;
  
  // Estrutura de resposta compatível com o frontend do NotiChat
  const responseData = {
    type: 'new_message',
    id: messageData._id || Date.now() + Math.random(),
    username: user.username,
    message: messageData.content || message.message,
    timestamp: new Date().toLocaleTimeString('pt-BR'),
    userId: user.userId,
    data: {
      conversationId: conversationId,
      attachments: messageData.attachments || [],
      _id: messageData._id || Date.now() + Math.random(),
      content: messageData.content || message.message,
      sender: {
        _id: user.userId,
        name: user.name,
        username: user.username
      },
      conversation: conversationId,
      createdAt: messageData.createdAt || new Date().toISOString()
    }
  };
  
  // Broadcast para todos os usuários (pode ser filtrado por conversa no futuro)
  broadcast(responseData);
  
  console.log(`Mensagem de ${user.username}: ${messageData.content || message.message} na conversa ${conversationId}`);
}

function handleTypingStart(ws, message) {
  const user = connectedUsers.get(ws.clientId);
  if (!user) return;
  
  const conversationId = message.conversationId;
  
  broadcast({
    type: 'user_typing',
    conversationId: conversationId,
    username: user.username,
    userId: user.userId,
    isTyping: true,
    data: {
      userId: user.userId,
      username: user.username,
      name: user.name
    }
  }, ws);
  
  console.log(`${user.username} está digitando na conversa ${conversationId}`);
}

function handleTypingStop(ws, message) {
  const user = connectedUsers.get(ws.clientId);
  if (!user) return;
  
  const conversationId = message.conversationId;
  
  broadcast({
    type: 'user_typing',
    conversationId: conversationId,
    username: user.username,
    userId: user.userId,
    isTyping: false,
    data: {
      userId: user.userId
    }
  }, ws);
  
  console.log(`${user.username} parou de digitar na conversa ${conversationId}`);
}

function handleReaction(ws, message) {
  const user = connectedUsers.get(ws.clientId);
  if (!user) return;
  
  const reactionData = message.data || message;
  
  // Se for um evento customizado, verificar se é uma reação
  if (message.type === 'custom_event' && reactionData.event === 'reaction') {
    const responseData = {
      type: 'reaction',
      data: {
        messageId: reactionData.messageId,
        emoji: reactionData.emoji,
        userId: user.userId,
        username: user.username,
        name: user.name,
        createdAt: new Date().toISOString()
      }
    };
    
    broadcast(responseData);
    console.log(`${user.username} reagiu com ${reactionData.emoji} à mensagem ${reactionData.messageId}`);
  } else if (message.type === 'reaction') {
    // Reação direta
    const responseData = {
      type: 'reaction',
      data: {
        messageId: reactionData.messageId,
        emoji: reactionData.emoji,
        userId: user.userId,
        username: user.username,
        name: user.name,
        createdAt: new Date().toISOString()
      }
    };
    
    broadcast(responseData);
    console.log(`${user.username} reagiu com ${reactionData.emoji} à mensagem ${reactionData.messageId}`);
  } else {
    // Outros eventos customizados
    console.log('Evento personalizado recebido:', reactionData);
    sendToClient(ws, {
      type: 'custom_response',
      message: 'Evento recebido com sucesso!',
      data: reactionData
    });
  }
}

function handleMessageRead(ws, message) {
  const user = connectedUsers.get(ws.clientId);
  if (!user) return;
  
  const messageData = message.data || message;
  
  // Broadcast para notificar que a mensagem foi lida
  broadcast({
    type: 'message_read',
    data: {
      messageId: messageData.messageId,
      conversationId: messageData.conversationId,
      readBy: user.userId,
      readAt: new Date().toISOString()
    }
  }, ws);
  
  console.log(`${user.username} leu a mensagem ${messageData.messageId}`);
}

function handleDisconnection(ws) {
  const user = connectedUsers.get(ws.clientId);
  
  if (user) {
    // Remover dos mapas
    if (user.userId) {
      userToClientMap.delete(user.userId);
      clientToUserMap.delete(ws.clientId);
    }
    
    // Remover da lista de usuários conectados
    connectedUsers.delete(ws.clientId);
    
    // Notificar outros usuários
    broadcast({
      type: 'user_offline',
      data: {
        userId: user.userId,
        username: user.username
      }
    });
    
    // Atualizar lista de usuários
    const onlineUsers = Array.from(connectedUsers.values()).map(user => ({
      userId: user.userId,
      username: user.username,
      name: user.name,
      clientId: user.clientId
    }));
    
    broadcast({
      type: 'update_users',
      users: onlineUsers
    });
    
    console.log(`${user.username} (${user.userId}) desconectado`);
  } else {
    console.log(`Cliente desconectado: ${ws.clientId}`);
  }
}

// Endpoint para verificar status do servidor
app.get('/status', (req, res) => {
  res.json({
    status: 'online',
    connectedUsers: connectedUsers.size,
    timestamp: new Date().toISOString()
  });
});

// Endpoint para listar usuários conectados
app.get('/users', (req, res) => {
  const users = Array.from(connectedUsers.values()).map(user => ({
    userId: user.userId,
    username: user.username,
    name: user.name,
    joinTime: user.joinTime
  }));
  res.json(users);
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Servidor WebSocket NotiChat rodando em http://localhost:${PORT}`);
  console.log(`📱 Endpoint WebSocket: ws://localhost:${PORT}/ws`);
  console.log(`📊 Status: http://localhost:${PORT}/status`);
  console.log(`👥 Usuários: http://localhost:${PORT}/users`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('🔄 Encerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor encerrado');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  console.log('🔄 Encerrando servidor...');
  server.close(() => {
    console.log('✅ Servidor encerrado');
    process.exit(0);
  });
});
