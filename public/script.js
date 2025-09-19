// Variáveis globais
let ws = null;
let currentUser = null;
let isConnected = false;
let typingTimeout = null;
let onlineUsers = [];

// Elementos do DOM
const loginScreen = document.getElementById('loginScreen');
const chatScreen = document.getElementById('chatScreen');
const loginForm = document.getElementById('loginForm');
const usernameInput = document.getElementById('usernameInput');
const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');
const currentUsernameSpan = document.getElementById('currentUsername');
const connectionStatus = document.getElementById('connectionStatus');
const onlineCount = document.getElementById('onlineCount');
const typingIndicator = document.getElementById('typingIndicator');
const typingText = document.getElementById('typingText');
const userMenuBtn = document.getElementById('userMenuBtn');
const userDropdown = document.getElementById('userDropdown');
const usersSidebar = document.getElementById('usersSidebar');
const usersList = document.getElementById('usersList');
const toast = document.getElementById('toast');

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Aplicação carregada');
    console.log('📍 URL atual:', window.location.href);
    console.log('🌐 Hostname:', window.location.hostname);
    console.log('🔒 Protocol:', window.location.protocol);
    
    // Testar conectividade com o servidor
    try {
        const serverStatus = await testServerConnection();
        if (serverStatus) {
            console.log('✅ Servidor está online e acessível');
        } else {
            console.warn('⚠️ Servidor não está respondendo adequadamente');
        }
    } catch (error) {
        console.error('❌ Erro ao verificar status do servidor:', error);
    }
    
    // Login form
    loginForm.addEventListener('submit', handleLogin);
    
    // Message form
    messageForm.addEventListener('submit', handleSendMessage);
    
    // Typing indicators
    messageInput.addEventListener('input', handleTyping);
    messageInput.addEventListener('keypress', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            handleSendMessage(e);
        }
    });
    
    // User menu
    userMenuBtn.addEventListener('click', toggleUserDropdown);
    
    // Dropdown items
    document.getElementById('toggleUsers').addEventListener('click', toggleUsersSidebar);
    document.getElementById('toggleTheme').addEventListener('click', toggleTheme);
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Close sidebar
    document.getElementById('closeSidebar').addEventListener('click', () => {
        usersSidebar.classList.add('hidden');
        usersSidebar.classList.remove('show');
    });
    
    // Close dropdowns when clicking outside
    document.addEventListener('click', (e) => {
        if (!userMenuBtn.contains(e.target) && !userDropdown.contains(e.target)) {
            userDropdown.classList.add('hidden');
        }
        if (!usersSidebar.contains(e.target) && !document.getElementById('toggleUsers').contains(e.target)) {
            usersSidebar.classList.add('hidden');
            usersSidebar.classList.remove('show');
        }
    });
    
    // Focus no input de username
    usernameInput.focus();
});

// Funções de conexão WebSocket
function connectWebSocket() {
    // Detectar se estamos em produção ou desenvolvimento
    const isLocalhost = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1';
    
    let wsUrl;
    if (isLocalhost) {
        // Em desenvolvimento local
        const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
        wsUrl = `${protocol}//${window.location.host}/ws`;
    } else {
        // Em produção (sempre usar wss para HTTPS)
        wsUrl = `wss://${window.location.host}/ws`;
    }
    
    console.log('Tentando conectar ao WebSocket:', wsUrl);
    console.log('Hostname:', window.location.hostname);
    console.log('Protocol:', window.location.protocol);
    console.log('Host:', window.location.host);
    
    try {
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('✅ Conectado ao WebSocket com sucesso');
            isConnected = true;
            updateConnectionStatus('Conectado', 'success');
        };
        
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (error) {
                console.error('Erro ao processar mensagem:', error);
            }
        };
        
        ws.onclose = (event) => {
            console.log('❌ WebSocket desconectado:', event.code, event.reason);
            isConnected = false;
            updateConnectionStatus('Desconectado', 'error');
            
            // Não mostrar toast de reconexão se foi logout intencional
            if (currentUser) {
                showToast('Conexão perdida. Tentando reconectar...', 'error');
                
                // Tentar reconectar após 3 segundos
                setTimeout(() => {
                    if (!isConnected && currentUser) {
                        console.log('🔄 Tentando reconectar...');
                        connectWebSocket();
                    }
                }, 3000);
            }
        };
        
        ws.onerror = (error) => {
            console.error('❌ Erro no WebSocket:', error);
            updateConnectionStatus('Erro de conexão', 'error');
        };
        
    } catch (error) {
        console.error('❌ Erro ao criar WebSocket:', error);
        updateConnectionStatus('Erro ao conectar', 'error');
    }
}

function handleWebSocketMessage(data) {
    switch (data.type) {
        case 'connection_established':
            console.log('Conexão estabelecida:', data.clientId);
            break;
            
        case 'new_message':
            addMessage(data);
            break;
            
        case 'user_online':
            handleUserOnline(data.data);
            break;
            
        case 'user_offline':
            handleUserOffline(data.data);
            break;
            
        case 'users_online':
            updateOnlineUsers(data.users);
            break;
            
        case 'update_users':
            updateOnlineUsers(data.users);
            break;
            
        case 'user_typing':
            handleUserTyping(data);
            break;
            
        case 'reaction':
            handleReaction(data.data);
            break;
            
        case 'message_read':
            handleMessageRead(data.data);
            break;
            
        case 'error':
            showToast(data.message || 'Erro no servidor', 'error');
            break;
            
        default:
            console.log('Mensagem não reconhecida:', data);
    }
}

// Funções de interface
async function handleLogin(e) {
    e.preventDefault();
    
    const username = usernameInput.value.trim();
    if (!username) {
        showToast('Por favor, digite seu nome', 'error');
        return;
    }
    
    // Mostrar loading
    const loginBtn = loginForm.querySelector('button');
    const originalText = loginBtn.innerHTML;
    loginBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Conectando...';
    loginBtn.disabled = true;
    
    console.log('🚀 Iniciando login para usuário:', username);
    
    // Testar conectividade com o servidor primeiro
    const serverOk = await testServerConnection();
    if (!serverOk) {
        showToast('Servidor não está respondendo. Tente novamente.', 'error');
        loginBtn.innerHTML = originalText;
        loginBtn.disabled = false;
        return;
    }
    
    currentUser = {
        username: username,
        userId: generateUserId(),
        name: username
    };
    
    // Conectar ao WebSocket
    connectWebSocket();
    
    // Aguardar conexão com timeout mais longo
    let attempts = 0;
    const maxAttempts = 10; // 5 segundos no total
    
    const checkConnection = () => {
        attempts++;
        console.log(`⏳ Verificando conexão... tentativa ${attempts}/${maxAttempts}`);
        
        if (isConnected && ws && ws.readyState === WebSocket.OPEN) {
            console.log('✅ Conexão estabelecida, enviando dados do usuário...');
            
            // Enviar dados do usuário
            sendWebSocketMessage({
                type: 'user_connect',
                data: currentUser
            });
            
            // Trocar de tela
            showChatScreen();
            
            // Restaurar botão
            loginBtn.innerHTML = originalText;
            loginBtn.disabled = false;
            
        } else if (attempts >= maxAttempts) {
            console.error('❌ Timeout na conexão WebSocket');
            showToast('Erro ao conectar. Verifique sua conexão e tente novamente.', 'error');
            
            // Restaurar botão
            loginBtn.innerHTML = originalText;
            loginBtn.disabled = false;
            
            currentUser = null;
            if (ws) {
                ws.close();
            }
        } else {
            // Tentar novamente em 500ms
            setTimeout(checkConnection, 500);
        }
    };
    
    // Iniciar verificação
    setTimeout(checkConnection, 500);
}

function showChatScreen() {
    currentUsernameSpan.textContent = currentUser.username;
    
    loginScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    chatScreen.classList.add('fade-in');
    
    messageInput.focus();
    showToast(`Bem-vindo, ${currentUser.username}!`, 'success');
}

function handleSendMessage(e) {
    e.preventDefault();
    
    const message = messageInput.value.trim();
    if (!message || !isConnected) return;
    
    const messageData = {
        type: 'chat_message',
        conversationId: 'general',
        data: {
            content: message,
            _id: Date.now(),
            createdAt: new Date().toISOString()
        }
    };
    
    sendWebSocketMessage(messageData);
    messageInput.value = '';
    
    // Parar indicador de digitação
    clearTimeout(typingTimeout);
    sendWebSocketMessage({
        type: 'typing_stop',
        conversationId: 'general'
    });
}

function handleTyping() {
    if (!isConnected) return;
    
    // Enviar indicador de digitação
    sendWebSocketMessage({
        type: 'typing_start',
        conversationId: 'general'
    });
    
    // Parar digitação após 3 segundos de inatividade
    clearTimeout(typingTimeout);
    typingTimeout = setTimeout(() => {
        sendWebSocketMessage({
            type: 'typing_stop',
            conversationId: 'general'
        });
    }, 3000);
}

function addMessage(messageData) {
    // Remover mensagem de boas-vindas se existir
    const welcomeMessage = messagesDiv.querySelector('.welcome-message');
    if (welcomeMessage) {
        welcomeMessage.remove();
    }
    
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.dataset.messageId = messageData.id || messageData.data?._id;
    
    const isOwnMessage = messageData.username === currentUser?.username;
    if (isOwnMessage) {
        messageElement.style.borderLeftColor = '#28a745';
    }
    
    messageElement.innerHTML = `
        <div class="message-header">
            <span class="message-author">${messageData.username || 'Usuário'}</span>
            <span class="message-time">${messageData.timestamp || new Date().toLocaleTimeString('pt-BR')}</span>
        </div>
        <div class="message-content">${escapeHtml(messageData.message || messageData.data?.content || '')}</div>
    `;
    
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
    
    // Som de notificação (opcional)
    if (!isOwnMessage) {
        playNotificationSound();
    }
}

function handleUserOnline(userData) {
    showToast(`${userData.username || userData.name} entrou no chat`, 'info');
}

function handleUserOffline(userData) {
    showToast(`${userData.username} saiu do chat`, 'info');
}

function updateOnlineUsers(users) {
    console.log('👥 Atualizando lista de usuários online:', users);
    onlineUsers = users || [];
    onlineCount.textContent = onlineUsers.length;
    
    console.log(`📊 Total de usuários: ${onlineUsers.length}`);
    
    // Atualizar sidebar de usuários
    usersList.innerHTML = '';
    
    if (onlineUsers.length === 0) {
        console.log('⚠️ Nenhum usuário online encontrado');
        const emptyMessage = document.createElement('div');
        emptyMessage.classList.add('empty-users-message');
        emptyMessage.innerHTML = `
            <div style="text-align: center; padding: 2rem; color: var(--text-light);">
                <i class="fas fa-user-slash" style="font-size: 2rem; margin-bottom: 1rem;"></i>
                <p>Nenhum usuário online</p>
            </div>
        `;
        usersList.appendChild(emptyMessage);
        return;
    }
    
    onlineUsers.forEach((user, index) => {
        console.log(`👤 Adicionando usuário ${index + 1}:`, user);
        const userElement = document.createElement('div');
        userElement.classList.add('user-item');
        
        const isCurrentUser = user.username === currentUser?.username;
        const displayName = user.name || user.username || 'Usuário';
        
        userElement.innerHTML = `
            <div class="user-avatar">${displayName.charAt(0).toUpperCase()}</div>
            <div class="user-info">
                <div class="user-name">${displayName}${isCurrentUser ? ' (Você)' : ''}</div>
                <div class="user-status">Online</div>
            </div>
        `;
        
        usersList.appendChild(userElement);
    });
    
    console.log('✅ Lista de usuários atualizada com sucesso');
}

function handleUserTyping(data) {
    if (data.userId === currentUser?.userId) return;
    
    if (data.isTyping) {
        typingText.textContent = `${data.username} está digitando...`;
        typingIndicator.classList.remove('hidden');
    } else {
        typingIndicator.classList.add('hidden');
    }
}

function handleReaction(reactionData) {
    showToast(`${reactionData.username} reagiu com ${reactionData.emoji}`, 'info');
}

function handleMessageRead(readData) {
    // Implementar indicador de leitura se necessário
    console.log('Mensagem lida:', readData);
}

// Funções utilitárias
function sendWebSocketMessage(data) {
    if (ws && ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify(data));
        console.log('📤 Mensagem enviada:', data.type);
    } else {
        console.error('❌ WebSocket não está conectado. Estado:', ws?.readyState);
        showToast('Não conectado ao servidor', 'error');
    }
}

// Função para testar conectividade com o servidor
async function testServerConnection() {
    try {
        console.log('🔍 Testando conectividade com servidor...');
        const response = await fetch('/status');
        const data = await response.json();
        console.log('✅ Servidor respondeu:', data);
        return true;
    } catch (error) {
        console.error('❌ Erro ao testar servidor:', error);
        return false;
    }
}

function updateConnectionStatus(status, type) {
    connectionStatus.textContent = status;
    connectionStatus.className = `status ${type}`;
}

function showToast(message, type = 'info') {
    const toastContent = toast.querySelector('.toast-content');
    const toastIcon = toast.querySelector('.toast-icon');
    const toastMessage = toast.querySelector('.toast-message');
    
    // Ícones para cada tipo
    const icons = {
        success: 'fas fa-check-circle',
        error: 'fas fa-exclamation-circle',
        info: 'fas fa-info-circle'
    };
    
    toastIcon.className = `toast-icon ${icons[type]}`;
    toastMessage.textContent = message;
    toast.className = `toast ${type} show`;
    
    // Esconder após 3 segundos
    setTimeout(() => {
        toast.classList.remove('show');
    }, 3000);
}

function toggleUserDropdown() {
    userDropdown.classList.toggle('hidden');
    if (!userDropdown.classList.contains('hidden')) {
        userDropdown.classList.add('show');
    } else {
        userDropdown.classList.remove('show');
    }
}

function toggleUsersSidebar() {
    console.log('🔄 Toggling users sidebar');
    
    if (usersSidebar.classList.contains('hidden')) {
        usersSidebar.classList.remove('hidden');
        usersSidebar.classList.add('show');
        console.log('👥 Mostrando sidebar de usuários');
    } else {
        usersSidebar.classList.add('hidden');
        usersSidebar.classList.remove('show');
        console.log('🙈 Ocultando sidebar de usuários');
    }
    
    userDropdown.classList.add('hidden');
    userDropdown.classList.remove('show');
}

function toggleTheme() {
    const currentTheme = document.documentElement.getAttribute('data-theme');
    const newTheme = currentTheme === 'dark' ? 'light' : 'dark';
    
    document.documentElement.setAttribute('data-theme', newTheme);
    localStorage.setItem('theme', newTheme);
    
    const themeBtn = document.getElementById('toggleTheme');
    const icon = themeBtn.querySelector('i');
    const text = themeBtn.querySelector('span');
    
    if (newTheme === 'dark') {
        icon.className = 'fas fa-sun';
        text.textContent = 'Modo claro';
    } else {
        icon.className = 'fas fa-moon';
        text.textContent = 'Modo escuro';
    }
    
    userDropdown.classList.add('hidden');
    userDropdown.classList.remove('show');
}

function logout() {
    if (ws) {
        ws.close();
    }
    
    currentUser = null;
    isConnected = false;
    onlineUsers = [];
    
    // Limpar mensagens
    messagesDiv.innerHTML = `
        <div class="welcome-message">
            <div class="welcome-icon">
                <i class="fas fa-comments"></i>
            </div>
            <h3>Bem-vindo ao NotiChat!</h3>
            <p>Comece uma conversa digitando uma mensagem abaixo.</p>
        </div>
    `;
    
    // Voltar para tela de login
    chatScreen.classList.add('hidden');
    loginScreen.classList.remove('hidden');
    
    // Limpar formulário
    usernameInput.value = '';
    messageInput.value = '';
    
    // Esconder dropdowns
    userDropdown.classList.add('hidden');
    usersSidebar.classList.add('hidden');
    usersSidebar.classList.remove('show');
    
    usernameInput.focus();
    showToast('Você saiu do chat', 'info');
}

function generateUserId() {
    return 'user_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
}

function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function playNotificationSound() {
    // Criar um som simples de notificação
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.exponentialRampToValueAtTime(400, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.1);
        
        oscillator.start();
        oscillator.stop(audioContext.currentTime + 0.1);
    } catch (error) {
        // Navegador pode não suportar Web Audio API
        console.log('Som de notificação não disponível');
    }
}

// Carregar tema salvo
document.addEventListener('DOMContentLoaded', () => {
    const savedTheme = localStorage.getItem('theme');
    if (savedTheme) {
        document.documentElement.setAttribute('data-theme', savedTheme);
        
        const themeBtn = document.getElementById('toggleTheme');
        if (themeBtn) {
            const icon = themeBtn.querySelector('i');
            const text = themeBtn.querySelector('span');
            
            if (savedTheme === 'dark') {
                icon.className = 'fas fa-sun';
                text.textContent = 'Modo claro';
            }
        }
    }
});

// Reconexão automática em caso de perda de conexão
window.addEventListener('online', () => {
    if (!isConnected && currentUser) {
        showToast('Conexão restaurada. Reconectando...', 'info');
        connectWebSocket();
    }
});

window.addEventListener('offline', () => {
    showToast('Conexão perdida. Verifique sua internet.', 'error');
});

// Função de teste para verificar se a sidebar funciona
function testSidebar() {
    console.log('🧪 Testando sidebar de usuários');
    
    // Dados de teste
    const testUsers = [
        { userId: '1', username: 'usuario1', name: 'Usuário 1' },
        { userId: '2', username: 'usuario2', name: 'Usuário 2' },
        { userId: '3', username: 'teste', name: 'Usuário Teste' }
    ];
    
    // Atualizar com dados de teste
    updateOnlineUsers(testUsers);
    
    // Forçar exibição da sidebar
    usersSidebar.classList.remove('hidden');
    usersSidebar.classList.add('show');
    
    console.log('✅ Teste da sidebar executado');
}

// Adicionar tecla de atalho para teste (Ctrl+Shift+T)
document.addEventListener('keydown', (e) => {
    if (e.ctrlKey && e.shiftKey && e.key === 'T') {
        testSidebar();
    }
});
