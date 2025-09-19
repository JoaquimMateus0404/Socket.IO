// Funções utilitárias
function generateUserId() {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 9);
    return `user_${timestamp}_${random}`;
}

// Variáveis globais
let ws = null;
let currentUser = null;
let isConnected = false;
let typingTimeout = null;
let onlineUsers = [];
let isReconnecting = false;
let reconnectAttempts = 0;
let maxReconnectAttempts = 5;

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
const toggleSidebar = document.getElementById('toggleSidebar');
const closeSidebar = document.getElementById('closeSidebar');
const sendBtn = document.getElementById('sendBtn');
const userInitials = document.getElementById('userInitials');
const dropdownInitials = document.getElementById('dropdownInitials');
const dropdownUsername = document.getElementById('dropdownUsername');

// Event Listeners
document.addEventListener('DOMContentLoaded', async () => {
    console.log('🚀 Aplicação carregada');
    console.log('📍 URL atual:', window.location.href);
    console.log('🌐 Hostname:', window.location.hostname);
    console.log('🔒 Protocol:', window.location.protocol);
    
    // Inicializar melhorias se disponíveis
    setTimeout(() => {
        if (window.initializeEnhancements) {
            console.log('🎨 Inicializando melhorias do chat...');
            window.initializeEnhancements();
        }
    }, 100);
    
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
    
    // Sidebar controls
    if (toggleSidebar) {
        toggleSidebar.addEventListener('click', () => {
            usersSidebar.classList.toggle('hidden');
        });
    }
    
    if (closeSidebar) {
        closeSidebar.addEventListener('click', () => {
            usersSidebar.classList.add('hidden');
        });
    }
    
    // Dropdown items
    document.getElementById('toggleUsers').addEventListener('click', () => {
        usersSidebar.classList.toggle('hidden');
        userDropdown.classList.add('hidden');
        userDropdown.classList.remove('show');
    });
    document.getElementById('toggleTheme').addEventListener('click', () => {
        if (window.toggleThemeEnhanced) {
            window.toggleThemeEnhanced();
        } else {
            toggleTheme();
        }
        userDropdown.classList.add('hidden');
        userDropdown.classList.remove('show');
    });
    document.getElementById('logoutBtn').addEventListener('click', logout);
    
    // Funcionalidades dos botões do header
    document.getElementById('searchBtn').addEventListener('click', toggleSearch);
    document.getElementById('notificationBtn').addEventListener('click', toggleNotifications);
    document.getElementById('fullscreenBtn').addEventListener('click', toggleFullscreen);
    
    // Outros botões funcionais
    document.getElementById('emojiBtn').addEventListener('click', toggleEmojiPicker);
    document.getElementById('attachBtn').addEventListener('click', handleFileAttach);
    document.getElementById('clearHistory').addEventListener('click', clearChatHistory);
    document.getElementById('toggleNotifications').addEventListener('click', togglePushNotifications);
    
    // Novos event listeners para melhorias
    if (document.getElementById('clearHistory')) {
        document.getElementById('clearHistory').addEventListener('click', () => {
            if (window.messageHistory) {
                window.messageHistory.clear();
                messagesDiv.innerHTML = `
                    <div class="welcome-message">
                        <div class="welcome-icon">
                            <i class="fas fa-comments"></i>
                        </div>
                        <h3>Bem-vindo ao NotiChat!</h3>
                        <p>Comece uma conversa digitando uma mensagem abaixo.</p>
                    </div>
                `;
                showToast('Histórico limpo com sucesso!', 'success');
            }
            userDropdown.classList.add('hidden');
            userDropdown.classList.remove('show');
        });
    }
    
    if (document.getElementById('toggleNotifications')) {
        document.getElementById('toggleNotifications').addEventListener('click', async () => {
            if ('Notification' in window) {
                const permission = await Notification.requestPermission();
                if (permission === 'granted') {
                    showToast('Notificações ativadas!', 'success');
                } else {
                    showToast('Permissão para notificações negada', 'warning');
                }
            } else {
                showToast('Notificações não suportadas neste navegador', 'error');
            }
            userDropdown.classList.add('hidden');
            userDropdown.classList.remove('show');
        });
    }
    
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
    if (isReconnecting) {
        console.log('⏳ Já tentando reconectar, ignorando tentativa adicional');
        return;
    }
    
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
    
    console.log('🔌 Tentando conectar ao WebSocket:', wsUrl);
    console.log('🏠 Hostname:', window.location.hostname);
    console.log('🔒 Protocol:', window.location.protocol);
    console.log('🌐 Host:', window.location.host);
    console.log('🔢 Tentativa:', reconnectAttempts + 1);
    
    try {
        // Fechar conexão anterior se existir
        if (ws) {
            ws.close();
        }
        
        ws = new WebSocket(wsUrl);
        
        ws.onopen = () => {
            console.log('✅ Conectado ao WebSocket com sucesso');
            isConnected = true;
            isReconnecting = false;
            reconnectAttempts = 0;
            updateConnectionStatus('Conectado', 'success');
        };
        
        ws.onmessage = (event) => {
            try {
                const data = JSON.parse(event.data);
                handleWebSocketMessage(data);
            } catch (error) {
                console.error('❌ Erro ao processar mensagem:', error);
            }
        };
        
        ws.onclose = (event) => {
            console.log(`❌ WebSocket desconectado: code=${event.code}, reason="${event.reason}"`);
            isConnected = false;
            updateConnectionStatus('Desconectado', 'error');
            
            // Não tentar reconectar se foi logout intencional ou se atingiu o limite
            if (currentUser && reconnectAttempts < maxReconnectAttempts && !isReconnecting) {
                isReconnecting = true;
                reconnectAttempts++;
                
                showToast(`Conexão perdida. Tentando reconectar... (${reconnectAttempts}/${maxReconnectAttempts})`, 'error');
                
                // Exponential backoff: 3s, 6s, 12s, 24s, 48s
                const delay = Math.min(3000 * Math.pow(2, reconnectAttempts - 1), 30000);
                
                setTimeout(() => {
                    if (!isConnected && currentUser) {
                        console.log(`🔄 Tentativa de reconexão ${reconnectAttempts}/${maxReconnectAttempts} em ${delay}ms`);
                        connectWebSocket();
                    } else {
                        isReconnecting = false;
                    }
                }, delay);
            } else if (reconnectAttempts >= maxReconnectAttempts) {
                showToast('Não foi possível reconectar. Recarregue a página.', 'error');
                isReconnecting = false;
            }
        };
        
        ws.onerror = (error) => {
            console.error('❌ Erro no WebSocket:', error);
            updateConnectionStatus('Erro de conexão', 'error');
            isReconnecting = false;
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
            
        case 'already_connected':
            console.log('ℹ️ Usuário já está conectado, ignorando tentativa de reconexão');
            break;
            
        case 'session_replaced':
            console.log('⚠️ Sessão foi substituída por uma nova conexão');
            showToast('Sua sessão foi substituída por uma nova conexão', 'warning');
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
    
    // Atualizar iniciais do usuário
    const initials = currentUser.username.substring(0, 2).toUpperCase();
    if (userInitials) userInitials.textContent = initials;
    if (dropdownInitials) dropdownInitials.textContent = initials;
    if (dropdownUsername) dropdownUsername.textContent = currentUser.username;
    
    loginScreen.classList.add('hidden');
    chatScreen.classList.remove('hidden');
    chatScreen.classList.add('fade-in');
    
    messageInput.focus();
    showToast(`Bem-vindo, ${currentUser.username}!`, 'success');
}

function handleSendMessage(e) {
    e.preventDefault();
    
    const message = messageInput.value.trim();
    if (!message) return;
    
    if (!ws || ws.readyState !== WebSocket.OPEN) {
        showToast('Conexão perdida. Tentando reconectar...', 'warning');
        connectWebSocket();
        return;
    }
    
    // Adicionar efeito visual no botão
    const sendBtn = document.getElementById('sendBtn');
    sendBtn.style.transform = 'scale(0.95)';
    setTimeout(() => {
        sendBtn.style.transform = '';
    }, 150);
    
    // Enviar mensagem
    try {
        ws.send(JSON.stringify({
            type: 'message',
            content: message,
            user: currentUser
        }));
        
        messageInput.value = '';
        messageInput.focus();
        
        // Scroll automático para baixo
        setTimeout(() => {
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        }, 100);
        
    } catch (error) {
        console.error('❌ Erro ao enviar mensagem:', error);
        showToast('Erro ao enviar mensagem. Tente novamente.', 'error');
    }
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
    // Usar versão melhorada se disponível
    if (window.addMessageToChatEnhanced) {
        return window.addMessageToChatEnhanced(messageData, true);
    }
    
    // Versão básica como fallback
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
    
    // Scroll automático usando função inteligente se disponível
    if (window.scrollToBottomSmart) {
        window.scrollToBottomSmart();
    } else {
        scrollToBottom();
    }
    
    // Som de notificação (opcional)
    if (!isOwnMessage) {
        if (window.playNotificationSound) {
            window.playNotificationSound();
        }
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
    if (userDropdown.classList.contains('show')) {
        userDropdown.classList.remove('show');
    } else {
        userDropdown.classList.add('show');
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
    console.log('👋 Fazendo logout...');
    
    // Resetar variáveis de reconexão antes de fechar
    isReconnecting = false;
    reconnectAttempts = 0;
    
    if (ws) {
        ws.close(1000, 'User logout');
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

// ===== FUNCIONALIDADES AVANÇADAS DOS BOTÕES =====

// Busca de mensagens
function toggleSearch() {
    console.log('🔍 Ativando busca de mensagens...');
    
    // Criar overlay de busca se não existir
    let searchOverlay = document.getElementById('searchOverlay');
    if (!searchOverlay) {
        searchOverlay = document.createElement('div');
        searchOverlay.id = 'searchOverlay';
        searchOverlay.className = 'search-overlay';
        searchOverlay.innerHTML = `
            <div class="search-container">
                <div class="search-header">
                    <h3><i class="fas fa-search"></i> Buscar Mensagens</h3>
                    <button class="close-search" onclick="closeSearch()">
                        <i class="fas fa-times"></i>
                    </button>
                </div>
                <div class="search-input-container">
                    <input type="text" id="searchInput" placeholder="Digite para buscar mensagens..." autocomplete="off">
                    <button class="search-btn"><i class="fas fa-search"></i></button>
                </div>
                <div class="search-results" id="searchResults">
                    <p class="search-placeholder">Digite algo para buscar nas mensagens...</p>
                </div>
            </div>
        `;
        document.body.appendChild(searchOverlay);
        
        // Adicionar event listener para busca
        document.getElementById('searchInput').addEventListener('input', performSearch);
    }
    
    searchOverlay.classList.add('show');
    setTimeout(() => document.getElementById('searchInput').focus(), 300);
}

function closeSearch() {
    const searchOverlay = document.getElementById('searchOverlay');
    if (searchOverlay) {
        searchOverlay.classList.remove('show');
    }
}

function performSearch() {
    const query = document.getElementById('searchInput').value.toLowerCase();
    const resultsDiv = document.getElementById('searchResults');
    
    if (query.length < 2) {
        resultsDiv.innerHTML = '<p class="search-placeholder">Digite pelo menos 2 caracteres...</p>';
        return;
    }
    
    // Buscar nas mensagens existentes
    const messages = document.querySelectorAll('.message');
    const results = [];
    
    messages.forEach((msg, index) => {
        const content = msg.textContent.toLowerCase();
        if (content.includes(query)) {
            results.push({
                element: msg,
                index: index,
                preview: content.substring(0, 100) + '...'
            });
        }
    });
    
    if (results.length === 0) {
        resultsDiv.innerHTML = '<p class="no-results">Nenhuma mensagem encontrada.</p>';
    } else {
        resultsDiv.innerHTML = results.map(result => `
            <div class="search-result" onclick="scrollToMessage(${result.index})">
                <div class="result-preview">${result.preview}</div>
            </div>
        `).join('');
    }
}

function scrollToMessage(index) {
    const messages = document.querySelectorAll('.message');
    if (messages[index]) {
        messages[index].scrollIntoView({ behavior: 'smooth', block: 'center' });
        messages[index].style.background = '#fff3cd';
        setTimeout(() => {
            messages[index].style.background = '';
        }, 2000);
    }
    closeSearch();
}

// Notificações
function toggleNotifications() {
    console.log('🔔 Ativando central de notificações...');
    showToast('Central de notificações ativada!', 'info');
    
    // Simular notificações
    setTimeout(() => {
        showToast('Nova mensagem de João!', 'info');
    }, 2000);
}

// Tela cheia
function toggleFullscreen() {
    console.log('🖥️ Alternando modo tela cheia...');
    
    if (!document.fullscreenElement) {
        document.documentElement.requestFullscreen().then(() => {
            const btn = document.getElementById('fullscreenBtn');
            btn.innerHTML = '<i class="fas fa-compress"></i>';
            btn.title = 'Sair da tela cheia';
            showToast('Modo tela cheia ativado', 'success');
        }).catch(err => {
            showToast('Erro ao ativar tela cheia', 'error');
        });
    } else {
        document.exitFullscreen().then(() => {
            const btn = document.getElementById('fullscreenBtn');
            btn.innerHTML = '<i class="fas fa-expand"></i>';
            btn.title = 'Tela cheia';
            showToast('Tela cheia desativada', 'info');
        });
    }
}

// Emoji picker
function toggleEmojiPicker() {
    console.log('😀 Ativando seletor de emojis...');
    
    const emojis = ['😀', '😃', '😄', '😁', '😆', '😅', '😂', '🤣', '😊', '😇', '🙂', '🙃', '😉', '😌', '😍', '🥰', '😘', '😗', '😙', '😚', '😋', '😛', '😝', '😜', '🤪', '🤨', '🧐', '🤓', '😎', '🥸', '🤩', '🥳'];
    
    let emojiPicker = document.getElementById('emojiPicker');
    if (!emojiPicker) {
        emojiPicker = document.createElement('div');
        emojiPicker.id = 'emojiPicker';
        emojiPicker.className = 'emoji-picker';
        emojiPicker.innerHTML = `
            <div class="emoji-header">
                <span>Escolha um emoji</span>
                <button onclick="closeEmojiPicker()"><i class="fas fa-times"></i></button>
            </div>
            <div class="emoji-grid">
                ${emojis.map(emoji => `<button class="emoji-btn" onclick="insertEmoji('${emoji}')">${emoji}</button>`).join('')}
            </div>
        `;
        document.getElementById('emojiBtn').appendChild(emojiPicker);
    }
    
    emojiPicker.classList.toggle('show');
}

function closeEmojiPicker() {
    const picker = document.getElementById('emojiPicker');
    if (picker) picker.classList.remove('show');
}

function insertEmoji(emoji) {
    const input = document.getElementById('messageInput');
    input.value += emoji;
    input.focus();
    closeEmojiPicker();
}

// Anexar arquivos
function handleFileAttach() {
    console.log('📎 Ativando anexo de arquivos...');
    
    const input = document.createElement('input');
    input.type = 'file';
    input.accept = 'image/*,text/*,.pdf,.doc,.docx';
    input.onchange = (e) => {
        const file = e.target.files[0];
        if (file) {
            if (file.size > 5 * 1024 * 1024) {
                showToast('Arquivo muito grande! Máximo 5MB.', 'error');
                return;
            }
            showToast(`Arquivo "${file.name}" selecionado (funcionalidade em desenvolvimento)`, 'info');
        }
    };
    input.click();
}

// Limpar histórico do chat
function clearChatHistory() {
    console.log('🗑️ Limpando histórico do chat...');
    
    if (confirm('Tem certeza que deseja limpar todo o histórico do chat?')) {
        const messagesDiv = document.getElementById('messages');
        messagesDiv.innerHTML = `
            <div class="welcome-section">
                <div class="welcome-animation">
                    <div class="welcome-icon">
                        <i class="fas fa-comments"></i>
                    </div>
                    <div class="welcome-rings">
                        <div class="ring"></div>
                        <div class="ring"></div>
                        <div class="ring"></div>
                    </div>
                </div>
                <h3>Chat limpo!</h3>
                <p>O histórico foi removido. Comece uma nova conversa.</p>
            </div>
        `;
        showToast('Histórico do chat limpo!', 'success');
        userDropdown.classList.remove('show');
    }
}

// Notificações push
function togglePushNotifications() {
    console.log('🔔 Configurando notificações push...');
    
    if ('Notification' in window) {
        if (Notification.permission === 'granted') {
            showToast('Notificações já estão ativadas!', 'success');
        } else if (Notification.permission !== 'denied') {
            Notification.requestPermission().then(permission => {
                if (permission === 'granted') {
                    showToast('Notificações ativadas com sucesso!', 'success');
                    new Notification('NotiChat', {
                        body: 'Notificações estão funcionando!',
                        icon: '/favicon.ico'
                    });
                } else {
                    showToast('Permissão para notificações negada', 'warning');
                }
            });
        } else {
            showToast('Notificações bloqueadas pelo navegador', 'error');
        }
    } else {
        showToast('Seu navegador não suporta notificações', 'error');
    }
    
    userDropdown.classList.remove('show');
}

// ===== ESTILOS DINÂMICOS PARA NOVAS FUNCIONALIDADES =====

// Adicionar estilos CSS dinamicamente
const dynamicStyles = document.createElement('style');
dynamicStyles.textContent = `
.search-overlay {
    position: fixed;
    top: 0;
    left: 0;
    width: 100%;
    height: 100%;
    background: rgba(0, 0, 0, 0.8);
    z-index: 2000;
    display: flex;
    align-items: center;
    justify-content: center;
    opacity: 0;
    visibility: hidden;
    transition: all 0.3s ease;
}

.search-overlay.show {
    opacity: 1;
    visibility: visible;
}

.search-container {
    background: var(--bg-primary);
    border-radius: 16px;
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    overflow: hidden;
    box-shadow: 0 20px 60px rgba(0, 0, 0, 0.3);
}

.search-header {
    padding: 1.5rem;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
    background: var(--bg-secondary);
}

.search-input-container {
    padding: 1.5rem;
    display: flex;
    gap: 1rem;
}

.search-input-container input {
    flex: 1;
    padding: 0.75rem;
    border: 2px solid var(--border-color);
    border-radius: 8px;
    font-size: 1rem;
}

.search-results {
    max-height: 300px;
    overflow-y: auto;
    padding: 1rem;
}

.search-result {
    padding: 1rem;
    border-radius: 8px;
    margin-bottom: 0.5rem;
    background: var(--bg-secondary);
    cursor: pointer;
    transition: all 0.2s ease;
}

.search-result:hover {
    background: var(--primary-color);
    color: white;
}

.emoji-picker {
    position: absolute;
    bottom: 100%;
    left: 0;
    background: var(--bg-primary);
    border: 1px solid var(--border-color);
    border-radius: 12px;
    box-shadow: 0 10px 30px rgba(0, 0, 0, 0.2);
    width: 300px;
    opacity: 0;
    visibility: hidden;
    transform: translateY(10px);
    transition: all 0.3s ease;
    z-index: 1000;
}

.emoji-picker.show {
    opacity: 1;
    visibility: visible;
    transform: translateY(0);
}

.emoji-header {
    padding: 1rem;
    border-bottom: 1px solid var(--border-color);
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
}

.emoji-grid {
    padding: 1rem;
    display: grid;
    grid-template-columns: repeat(8, 1fr);
    gap: 0.5rem;
    max-height: 200px;
    overflow-y: auto;
}

.emoji-grid .emoji-btn {
    padding: 0.5rem;
    border: none;
    background: none;
    font-size: 1.2rem;
    border-radius: 6px;
    cursor: pointer;
    transition: all 0.2s ease;
}

.emoji-grid .emoji-btn:hover {
    background: var(--bg-secondary);
    transform: scale(1.2);
}

.notification-badge {
    position: absolute;
    top: -5px;
    right: -5px;
    background: #e53e3e;
    color: white;
    border-radius: 50%;
    width: 18px;
    height: 18px;
    font-size: 10px;
    display: flex;
    align-items: center;
    justify-content: center;
    font-weight: 600;
}

.close-search {
    background: none;
    border: none;
    font-size: 1.2rem;
    cursor: pointer;
    color: var(--text-secondary);
    padding: 0.5rem;
    border-radius: 50%;
    transition: all 0.2s ease;
}

.close-search:hover {
    background: var(--border-color);
    color: var(--text-primary);
}
`;
document.head.appendChild(dynamicStyles);
