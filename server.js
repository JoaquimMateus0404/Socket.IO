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
// Map para controlar throttle de digitação
let typingThrottle = new Map();
// Map para controlar chamadas ativas
let activeCalls = new Map();

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
          // Verificar se o usuário já está conectado neste WebSocket
          if (ws.userData) {
            console.log(`⚠️ Tentativa de reconexão duplicada ignorada para ${ws.userData.username} (${ws.clientId})`);
            // Enviar confirmação de que já está conectado
            sendToClient(ws, {
              type: 'already_connected',
              userData: ws.userData
            });
            return;
          }
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
          
        case 'call_initiate':
          handleCallInitiate(ws, message);
          break;
          
        case 'call_accept':
          handleCallAccept(ws, message);
          break;
          
        case 'call_reject':
          handleCallReject(ws, message);
          break;
          
        case 'call_end':
          handleCallEnd(ws, message);
          break;

        // Novos handlers para WebRTC
        case 'call-offer':
          handleCallOffer(ws, message);
          break;
          
        case 'call-answer':
          handleCallAnswer(ws, message);
          break;
          
        case 'ice-candidate':
          handleIceCandidate(ws, message);
          break;
          
        case 'call-end':
          handleWebRTCCallEnd(ws, message);
          break;
          
        case 'call-reject':
          handleWebRTCCallReject(ws, message);
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

  ws.on('close', (code, reason) => {
    console.log(`🔌 Conexão fechada - clientId: ${ws.clientId}, code: ${code}, reason: ${reason}`);
    handleDisconnection(ws);
  });

  ws.on('error', (error) => {
    console.error(`❌ Erro no WebSocket (${ws.clientId}):`, error);
    handleDisconnection(ws);
  });
  
  // Adicionar heartbeat para detectar conexões mortas
  ws.isAlive = true;
  ws.on('pong', () => {
    ws.isAlive = true;
  });
});

// Sistema de heartbeat para detectar conexões mortas
const heartbeatInterval = setInterval(() => {
  wss.clients.forEach((ws) => {
    if (ws.isAlive === false) {
      console.log(`💀 Conexão morta detectada: ${ws.clientId}`);
      return ws.terminate();
    }
    
    ws.isAlive = false;
    ws.ping();
  });
}, 30000); // Verificar a cada 30 segundos

// Limpeza periódica de mapeamentos órfãos
const cleanupInterval = setInterval(() => {
  const orphanedMappings = [];
  
  // Verificar se todos os userToClientMap têm conexões válidas
  for (const [userId, clientId] of userToClientMap.entries()) {
    const clientExists = Array.from(wss.clients).some(client => 
      client.clientId === clientId && client.readyState === WebSocket.OPEN
    );
    
    if (!clientExists) {
      orphanedMappings.push({ userId, clientId });
    }
  }
  
  // Limpar mapeamentos órfãos
  orphanedMappings.forEach(({ userId, clientId }) => {
    console.log(`🧹 Limpando mapeamento órfão: ${userId} -> ${clientId}`);
    userToClientMap.delete(userId);
    clientToUserMap.delete(clientId);
    connectedUsers.delete(clientId);
  });
  
  if (orphanedMappings.length > 0) {
    console.log(`✅ Limpeza concluída: ${orphanedMappings.length} mapeamentos órfãos removidos`);
    
    // Atualizar lista de usuários para todos após limpeza
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
  }
}, 60000); // Limpeza a cada 60 segundos

// Handlers adaptados para o NotiChat
function handleUserConnect(ws, message) {
  const userId = message.data?.userId || message.userId;
  const username = message.data?.username || message.username;
  const name = message.data?.name || message.name;
  
  console.log(`🔄 Tentativa de conexão - userId: ${userId}, username: ${username}, clientId: ${ws.clientId}`);
  
  // Verificar se o usuário já está conectado
  const existingClientId = userToClientMap.get(userId);
  if (existingClientId && existingClientId !== ws.clientId) {
    // Encontrar a conexão anterior
    const existingWs = Array.from(wss.clients).find(client => client.clientId === existingClientId);
    if (existingWs && existingWs !== ws && existingWs.readyState === WebSocket.OPEN) {
      console.log(`⚠️ Desconectando sessão anterior do usuário ${username} (${existingClientId})`);
      
      // Notificar a conexão anterior que será desconectada
      sendToClient(existingWs, {
        type: 'session_replaced',
        message: 'Sua sessão foi substituída por uma nova conexão'
      });
      
      // Fechar a conexão anterior
      existingWs.close(1000, 'Session replaced');
      
      // Limpar dados da sessão anterior
      connectedUsers.delete(existingClientId);
      userToClientMap.delete(userId);
      clientToUserMap.delete(existingClientId);
      
      console.log(`✅ Sessão anterior limpa para ${username}`);
    } else if (!existingWs || existingWs.readyState !== WebSocket.OPEN) {
      // Conexão anterior já não existe, apenas limpar os mapas
      console.log(`🧹 Limpando mapeamento órfão para ${username} (${existingClientId})`);
      connectedUsers.delete(existingClientId);
      userToClientMap.delete(userId);
      clientToUserMap.delete(existingClientId);
    }
  }
  
  const userData = {
    clientId: ws.clientId,
    userId: userId,
    username: username,
    name: name,
    joinTime: new Date()
  };
  
  // Armazenar dados do usuário
  connectedUsers.set(ws.clientId, userData);
  ws.userData = userData;
  
  // Mapear userId para clientId
  if (userData.userId) {
    userToClientMap.set(userData.userId, ws.clientId);
    clientToUserMap.set(ws.clientId, userData.userId);
    console.log(`🔗 Mapeamento criado: ${userData.userId} -> ${ws.clientId}`);
  }
  
  console.log(`✅ ${userData.username || userData.name} (${userData.userId}) conectado como ${ws.clientId}`);
  console.log(`📊 Total de usuários conectados: ${connectedUsers.size}`);
  
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
  const messageContent = messageData.content || message.message;
  
  // Verificar se há participantes específicos da conversa
  const participants = message.participants || [];
  
  console.log(`Mensagem de ${user.username}: ${messageContent} na conversa ${conversationId}`);
  if (participants.length > 0) {
    console.log(`Participantes:`, participants);
  }
  
  // Estrutura de resposta compatível com o frontend do NotiChat
  const responseData = {
    type: 'new_message',
    id: messageData._id || Date.now() + Math.random(),
    username: user.username,
    message: messageContent,
    timestamp: new Date().toLocaleTimeString('pt-BR'),
    userId: user.userId,
    conversationId: conversationId,
    data: {
      conversationId: conversationId,
      attachments: messageData.attachments || [],
      _id: messageData._id || Date.now() + Math.random(),
      content: messageContent,
      sender: {
        _id: user.userId,
        name: user.name,
        username: user.username
      },
      conversation: conversationId,
      createdAt: messageData.createdAt || new Date().toISOString()
    }
  };
  
  // Se há participantes específicos, enviar apenas para eles
  if (participants && participants.length > 0) {
    // Enviar para cada participante específico
    participants.forEach(participantId => {
      const participantClientId = userToClientMap.get(participantId);
      if (participantClientId) {
        const participantWs = Array.from(wss.clients).find(client => 
          client.clientId === participantClientId && client.readyState === WebSocket.OPEN
        );
        if (participantWs) {
          sendToClient(participantWs, responseData);
          console.log(`Mensagem enviada para participante: ${participantId}`);
        }
      }
    });
    
    // Também enviar para o remetente (apenas uma vez)
    sendToClient(ws, responseData);
  } else {
    // Se não há participantes específicos, broadcast para todos
    broadcast(responseData);
  }
}

function handleTypingStart(ws, message) {
  const user = connectedUsers.get(ws.clientId);
  if (!user) return;
  
  const conversationId = message.conversationId;
  const throttleKey = `${user.userId}_${conversationId}`;
  const now = Date.now();
  
  // Throttle de 1 segundo para evitar spam
  if (typingThrottle.has(throttleKey)) {
    const lastTime = typingThrottle.get(throttleKey);
    if (now - lastTime < 1000) {
      return; // Ignorar se foi enviado há menos de 1 segundo
    }
  }
  
  typingThrottle.set(throttleKey, now);
  
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
  const throttleKey = `${user.userId}_${conversationId}`;
  
  // Remover do throttle
  typingThrottle.delete(throttleKey);
  
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

function handleCallInitiate(ws, message) {
  const caller = connectedUsers.get(ws.clientId);
  if (!caller) return;
  
  const { targetUserId, callType, conversationId } = message.data || message;
  
  if (!targetUserId) {
    sendToClient(ws, {
      type: 'error',
      message: 'ID do usuário de destino não fornecido'
    });
    return;
  }
  
  // Gerar ID único para a chamada
  const callId = uuidv4();
  
  // Armazenar informações da chamada
  activeCalls.set(callId, {
    callerId: caller.userId,
    targetUserId: targetUserId,
    callType: callType || 'voice',
    conversationId: conversationId,
    status: 'calling',
    startTime: new Date()
  });
  
  // Enviar notificação de chamada recebida para o usuário de destino
  const callData = {
    type: 'call_incoming',
    data: {
      callId: callId,
      callerId: caller.userId,
      callerName: caller.name || caller.username,
      callerUsername: caller.username,
      callType: callType || 'voice', // 'voice' ou 'video'
      conversationId: conversationId,
      timestamp: new Date().toISOString()
    }
  };
  
  sendToUser(targetUserId, callData);
  
  // Confirmar para quem iniciou a chamada
  sendToClient(ws, {
    type: 'call_initiated',
    data: {
      callId: callId,
      targetUserId: targetUserId,
      callType: callType || 'voice',
      conversationId: conversationId,
      status: 'calling'
    }
  });
  
  console.log(`${caller.username} iniciou chamada ${callType || 'voice'} para usuário ${targetUserId} (callId: ${callId})`);
}

function handleCallAccept(ws, message) {
  const accepter = connectedUsers.get(ws.clientId);
  if (!accepter) return;
  
  const { callId, callerId } = message.data || message;
  
  if (!callId || !callerId) {
    sendToClient(ws, {
      type: 'error',
      message: 'ID da chamada ou do chamador não fornecido'
    });
    return;
  }
  
  // Atualizar status da chamada
  const callInfo = activeCalls.get(callId);
  if (callInfo) {
    callInfo.status = 'active';
    callInfo.acceptTime = new Date();
  }
  
  // Notificar o chamador que a chamada foi aceita
  sendToUser(callerId, {
    type: 'call_accepted',
    data: {
      callId: callId,
      accepterId: accepter.userId,
      accepterName: accepter.name || accepter.username,
      accepterUsername: accepter.username,
      timestamp: new Date().toISOString()
    }
  });
  
  // Confirmar para quem aceitou
  sendToClient(ws, {
    type: 'call_started',
    data: {
      callId: callId,
      callerId: callerId,
      status: 'active'
    }
  });
  
  console.log(`${accepter.username} aceitou a chamada ${callId} de ${callerId}`);
}

function handleCallReject(ws, message) {
  const rejecter = connectedUsers.get(ws.clientId);
  if (!rejecter) return;
  
  const { callId, callerId } = message.data || message;
  
  if (!callId || !callerId) {
    sendToClient(ws, {
      type: 'error',
      message: 'ID da chamada ou do chamador não fornecido'
    });
    return;
  }
  
  // Remover da lista de chamadas ativas
  activeCalls.delete(callId);
  
  // Notificar o chamador que a chamada foi rejeitada
  sendToUser(callerId, {
    type: 'call_rejected',
    data: {
      callId: callId,
      rejecterId: rejecter.userId,
      rejecterName: rejecter.name || rejecter.username,
      rejecterUsername: rejecter.username,
      timestamp: new Date().toISOString()
    }
  });
  
  // Confirmar para quem rejeitou
  sendToClient(ws, {
    type: 'call_ended',
    data: {
      callId: callId,
      reason: 'rejected',
      status: 'ended'
    }
  });
  
  console.log(`${rejecter.username} rejeitou a chamada ${callId} de ${callerId}`);
}

function handleCallEnd(ws, message) {
  const ender = connectedUsers.get(ws.clientId);
  if (!ender) return;
  
  const { callId, otherUserId } = message.data || message;
  
  if (!callId) {
    sendToClient(ws, {
      type: 'error',
      message: 'ID da chamada não fornecido'
    });
    return;
  }
  
  // Remover da lista de chamadas ativas
  const callInfo = activeCalls.get(callId);
  if (callInfo) {
    callInfo.endTime = new Date();
    console.log(`Chamada ${callId} durou ${Math.round((callInfo.endTime - (callInfo.acceptTime || callInfo.startTime)) / 1000)} segundos`);
  }
  activeCalls.delete(callId);
  
  // Se há outro usuário, notificar sobre o fim da chamada
  if (otherUserId) {
    sendToUser(otherUserId, {
      type: 'call_ended',
      data: {
        callId: callId,
        enderId: ender.userId,
        enderName: ender.name || ender.username,
        enderUsername: ender.username,
        reason: 'ended_by_user',
        timestamp: new Date().toISOString()
      }
    });
  }
  
  // Confirmar para quem encerrou
  sendToClient(ws, {
    type: 'call_ended',
    data: {
      callId: callId,
      reason: 'ended_by_self',
      status: 'ended'
    }
  });
  
  console.log(`${ender.username} encerrou a chamada ${callId}`);
}

function handleDisconnection(ws) {
  const user = connectedUsers.get(ws.clientId);
  
  if (user) {
    // Limpar throttle de digitação
    const keysToDelete = Array.from(typingThrottle.keys()).filter(key => key.startsWith(user.userId));
    keysToDelete.forEach(key => typingThrottle.delete(key));
    
    // Encerrar chamadas ativas do usuário
    const userCalls = Array.from(activeCalls.entries()).filter(([callId, callInfo]) => 
      callInfo.callerId === user.userId || callInfo.targetUserId === user.userId
    );
    
    userCalls.forEach(([callId, callInfo]) => {
      const otherUserId = callInfo.callerId === user.userId ? callInfo.targetUserId : callInfo.callerId;
      
      // Notificar o outro usuário sobre a desconexão
      sendToUser(otherUserId, {
        type: 'call_ended',
        data: {
          callId: callId,
          enderId: user.userId,
          enderName: user.name || user.username,
          enderUsername: user.username,
          reason: 'user_disconnected',
          timestamp: new Date().toISOString()
        }
      });
      
      // Remover chamada da lista
      activeCalls.delete(callId);
      console.log(`Chamada ${callId} encerrada devido à desconexão de ${user.username}`);
    });
    
    // Remover dos mapas com verificação adicional
    if (user.userId) {
      // Verificar se o mapeamento ainda aponta para este cliente
      const currentClientId = userToClientMap.get(user.userId);
      if (currentClientId === ws.clientId) {
        userToClientMap.delete(user.userId);
        console.log(`🗑️ Removendo mapeamento: ${user.userId} -> ${ws.clientId}`);
      } else {
        console.log(`⚠️ Mapeamento inconsistente para ${user.userId}: esperado ${ws.clientId}, atual ${currentClientId}`);
      }
      clientToUserMap.delete(ws.clientId);
    }
    
    // Remover da lista de usuários conectados
    connectedUsers.delete(ws.clientId);
    
    console.log(`❌ ${user.username} (${user.userId}) desconectado (clientId: ${ws.clientId})`);
    console.log(`📊 Total de usuários conectados: ${connectedUsers.size}`);
    
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

// Handlers WebRTC para chamadas
function handleCallOffer(ws, message) {
  const caller = connectedUsers.get(ws.clientId);
  if (!caller) return;
  
  const { offer, to, callType, from } = message;
  
  // Enviar oferta para o usuário de destino
  sendToUser(to, {
    type: 'call-offer',
    offer,
    callType,
    from
  });
  
  console.log(`WebRTC offer enviada de ${caller.username} para usuário ${to}`);
}

function handleCallAnswer(ws, message) {
  const answerer = connectedUsers.get(ws.clientId);
  if (!answerer) return;
  
  const { answer, to } = message;
  
  // Enviar resposta para quem iniciou a chamada
  sendToUser(to, {
    type: 'call-answer',
    answer
  });
  
  console.log(`WebRTC answer enviada de ${answerer.username} para usuário ${to}`);
}

function handleIceCandidate(ws, message) {
  const user = connectedUsers.get(ws.clientId);
  if (!user) return;
  
  const { candidate, to } = message;
  
  // Enviar candidate para o peer
  sendToUser(to, {
    type: 'ice-candidate',
    candidate
  });
  
  console.log(`ICE candidate enviado de ${user.username} para usuário ${to}`);
}

function handleWebRTCCallEnd(ws, message) {
  const user = connectedUsers.get(ws.clientId);
  if (!user) return;
  
  const { to } = message;
  
  // Notificar o outro usuário que a chamada foi encerrada
  sendToUser(to, {
    type: 'call-end'
  });
  
  console.log(`Chamada WebRTC encerrada por ${user.username}`);
}

function handleWebRTCCallReject(ws, message) {
  const user = connectedUsers.get(ws.clientId);
  if (!user) return;
  
  const { to } = message;
  
  // Notificar quem iniciou a chamada que foi rejeitada
  sendToUser(to, {
    type: 'call-reject'
  });
  
  console.log(`Chamada WebRTC rejeitada por ${user.username}`);
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

// Endpoint para debug de conexões
app.get('/debug', (req, res) => {
  const connections = Array.from(wss.clients).map(client => ({
    clientId: client.clientId,
    readyState: client.readyState,
    userData: connectedUsers.get(client.clientId)
  }));
  
  const calls = Array.from(activeCalls.entries()).map(([callId, callInfo]) => ({
    callId,
    ...callInfo,
    duration: callInfo.acceptTime ? 
      Math.round((new Date() - callInfo.acceptTime) / 1000) + 's' : 
      Math.round((new Date() - callInfo.startTime) / 1000) + 's (not accepted)'
  }));
  
  res.json({
    totalConnections: wss.clients.size,
    totalUsers: connectedUsers.size,
    activeCalls: activeCalls.size,
    userToClientMappings: Object.fromEntries(userToClientMap),
    clientToUserMappings: Object.fromEntries(clientToUserMap),
    connections: connections,
    calls: calls,
    typingThrottleKeys: Array.from(typingThrottle.keys())
  });
});

// Endpoint para listar chamadas ativas
app.get('/calls', (req, res) => {
  const calls = Array.from(activeCalls.entries()).map(([callId, callInfo]) => {
    const callerUser = Array.from(connectedUsers.values()).find(user => user.userId === callInfo.callerId);
    const targetUser = Array.from(connectedUsers.values()).find(user => user.userId === callInfo.targetUserId);
    
    return {
      callId,
      caller: {
        userId: callInfo.callerId,
        username: callerUser?.username,
        name: callerUser?.name
      },
      target: {
        userId: callInfo.targetUserId,
        username: targetUser?.username,
        name: targetUser?.name
      },
      callType: callInfo.callType,
      status: callInfo.status,
      conversationId: callInfo.conversationId,
      startTime: callInfo.startTime,
      acceptTime: callInfo.acceptTime,
      duration: callInfo.acceptTime ? 
        Math.round((new Date() - callInfo.acceptTime) / 1000) : null
    };
  });
  
  res.json({
    totalActiveCalls: activeCalls.size,
    calls: calls
  });
});

const PORT = process.env.PORT || 3001;

server.listen(PORT, () => {
  console.log(`🚀 Servidor WebSocket NotiChat rodando em https://socket-io-qhs6.onrender.com/:${PORT}`);
  console.log(`📱 Endpoint WebSockethttps://socket-io-qhs6.onrender.com/:${PORT}/ws`);
  console.log(`📊 Status: https://socket-io-qhs6.onrender.com/:${PORT}/status`);
  console.log(`👥 Usuários: https://socket-io-qhs6.onrender.com/:${PORT}/users`);
  console.log(`� Chamadas: https://socket-io-qhs6.onrender.com/:${PORT}/calls`);
  console.log(`�🔧 Debug: https://socket-io-qhs6.onrender.com/:${PORT}/debug`);
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
