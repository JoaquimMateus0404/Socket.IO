// ===== MELHORIAS PARA O NOTICHAT =====

// Sistema de notificações push
let notificationsEnabled = false;

// Solicitar permissão para notificações
async function requestNotificationPermission() {
    if ('Notification' in window && Notification.permission === 'default') {
        const permission = await Notification.requestPermission();
        notificationsEnabled = permission === 'granted';
        
        if (notificationsEnabled) {
            showToast('Notificações ativadas!', 'success');
        }
    } else if (Notification.permission === 'granted') {
        notificationsEnabled = true;
    }
}

// Mostrar notificação
function showNotification(title, body, icon = '/favicon.ico') {
    if (notificationsEnabled && document.hidden) {
        new Notification(title, {
            body: body,
            icon: icon,
            badge: icon,
            tag: 'notichat-message'
        });
    }
}

// Sons de notificação (som sintético)
function playNotificationSound() {
    try {
        const audioContext = new (window.AudioContext || window.webkitAudioContext)();
        const oscillator = audioContext.createOscillator();
        const gainNode = audioContext.createGain();
        
        oscillator.connect(gainNode);
        gainNode.connect(audioContext.destination);
        
        oscillator.frequency.setValueAtTime(800, audioContext.currentTime);
        oscillator.frequency.setValueAtTime(600, audioContext.currentTime + 0.1);
        
        gainNode.gain.setValueAtTime(0.1, audioContext.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.2);
        
        oscillator.start(audioContext.currentTime);
        oscillator.stop(audioContext.currentTime + 0.2);
    } catch (error) {
        console.log('Som de notificação não disponível');
    }
}

// Sistema de histórico local
const messageHistory = {
    save: function(message) {
        try {
            const history = this.get();
            history.push(message);
            
            // Manter apenas as últimas 100 mensagens
            if (history.length > 100) {
                history.splice(0, history.length - 100);
            }
            
            localStorage.setItem('notichat_history', JSON.stringify(history));
        } catch (error) {
            console.error('Erro ao salvar mensagem no histórico:', error);
        }
    },
    
    get: function() {
        try {
            const history = localStorage.getItem('notichat_history');
            return history ? JSON.parse(history) : [];
        } catch (error) {
            console.error('Erro ao carregar histórico:', error);
            return [];
        }
    },
    
    clear: function() {
        try {
            localStorage.removeItem('notichat_history');
        } catch (error) {
            console.error('Erro ao limpar histórico:', error);
        }
    },
    
    load: function() {
        const history = this.get();
        if (history.length > 0) {
            console.log(`📚 Carregando ${history.length} mensagens do histórico`);
            history.forEach(message => {
                addMessageToChatEnhanced(message, false); // false = não salvar novamente
            });
        }
    }
};

// Versão melhorada da função de adicionar mensagem
function addMessageToChatEnhanced(messageData, saveToHistory = true) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.dataset.messageId = messageData.id;
    
    const isOwnMessage = messageData.userId === currentUser?.userId;
    if (isOwnMessage) {
        messageElement.classList.add('own-message');
    }
    
    // Avatar com iniciais coloridas
    const avatar = generateAvatar(messageData.username);
    
    // Processar links na mensagem
    const processedMessage = processMessageLinks(escapeHtml(messageData.message));
    
    messageElement.innerHTML = `
        <div class="message-avatar">${avatar}</div>
        <div class="message-content">
            <div class="message-header">
                <span class="message-username">${messageData.username}</span>
                <span class="message-time" title="${new Date().toLocaleString()}">${messageData.timestamp}</span>
                ${isOwnMessage ? '<i class="message-status fas fa-check" title="Enviada"></i>' : ''}
            </div>
            <div class="message-text">${processedMessage}</div>
            <div class="message-reactions">
                <button class="reaction-btn" data-emoji="👍" title="Curtir">👍</button>
                <button class="reaction-btn" data-emoji="❤️" title="Amar">❤️</button>
                <button class="reaction-btn" data-emoji="😂" title="Rir">😂</button>
                <button class="reaction-btn" data-emoji="😮" title="Surpresa">😮</button>
                <span class="reaction-count"></span>
            </div>
        </div>
    `;
    
    // Adicionar event listeners para reações
    const reactionButtons = messageElement.querySelectorAll('.reaction-btn');
    reactionButtons.forEach(button => {
        button.addEventListener('click', () => {
            const emoji = button.dataset.emoji;
            sendReaction(messageData.id, emoji);
            
            // Feedback visual imediato
            button.classList.add('reacted');
            setTimeout(() => button.classList.remove('reacted'), 300);
        });
    });
    
    messagesDiv.appendChild(messageElement);
    
    // Salvar no histórico
    if (saveToHistory) {
        messageHistory.save(messageData);
    }
    
    // Scroll automático inteligente
    scrollToBottomSmart();
    
    // Notificação se não for própria mensagem
    if (!isOwnMessage && messageData.username !== currentUser?.username) {
        showNotification(
            `💬 ${messageData.username}`,
            messageData.message
        );
        
        if (notificationsEnabled) {
            playNotificationSound();
        }
    }
}

// Gerar avatar com iniciais coloridas
function generateAvatar(username) {
    const initials = username.split(' ').map(name => name.charAt(0)).join('').substring(0, 2).toUpperCase();
    const colors = [
        '#FF6B6B', '#4ECDC4', '#45B7D1', '#FFA07A', '#98D8C8', 
        '#F7DC6F', '#BB8FCE', '#85C1E9', '#F8C471', '#82E0AA'
    ];
    
    // Usar username para gerar cor consistente
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const color = colors[Math.abs(hash) % colors.length];
    
    return `<div class="avatar" style="background-color: ${color}; color: white; width: 32px; height: 32px; border-radius: 50%; display: flex; align-items: center; justify-content: center; font-weight: 600; font-size: 14px;">${initials}</div>`;
}

// Processamento de links na mensagem
function processMessageLinks(text) {
    const urlRegex = /(https?:\/\/[^\s]+)/g;
    return text.replace(urlRegex, '<a href="$1" target="_blank" rel="noopener noreferrer">$1</a>');
}

// Scroll automático inteligente
function scrollToBottomSmart(force = false) {
    const isNearBottom = messagesDiv.scrollTop + messagesDiv.clientHeight >= messagesDiv.scrollHeight - 100;
    
    if (force || isNearBottom) {
        messagesDiv.scrollTop = messagesDiv.scrollHeight;
        hideNewMessageIndicator();
    } else {
        // Mostrar indicador de novas mensagens
        showNewMessageIndicator();
    }
}

// Indicador de novas mensagens
function showNewMessageIndicator() {
    let indicator = document.getElementById('newMessageIndicator');
    if (!indicator) {
        indicator = document.createElement('div');
        indicator.id = 'newMessageIndicator';
        indicator.className = 'new-message-indicator';
        indicator.innerHTML = `
            <i class="fas fa-arrow-down"></i>
            <span>Novas mensagens</span>
        `;
        indicator.addEventListener('click', () => {
            scrollToBottomSmart(true);
        });
        messagesDiv.parentNode.appendChild(indicator);
    }
    
    indicator.style.display = 'flex';
}

function hideNewMessageIndicator() {
    const indicator = document.getElementById('newMessageIndicator');
    if (indicator) {
        indicator.style.display = 'none';
    }
}

// Monitorar scroll para esconder indicador
function handleScrollMessages() {
    const isNearBottom = messagesDiv.scrollTop + messagesDiv.clientHeight >= messagesDiv.scrollHeight - 100;
    
    if (isNearBottom) {
        hideNewMessageIndicator();
    }
}

// Função para escapar HTML
function escapeHtml(text) {
    const div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// Enviar reação
function sendReaction(messageId, emoji) {
    if (ws && isConnected) {
        ws.send(JSON.stringify({
            type: 'reaction',
            data: {
                messageId: messageId,
                emoji: emoji
            }
        }));
    }
}

// Sistema de temas
const themes = {
    light: {
        name: 'Claro',
        icon: 'fas fa-sun'
    },
    dark: {
        name: 'Escuro', 
        icon: 'fas fa-moon'
    },
    blue: {
        name: 'Azul',
        icon: 'fas fa-palette'
    }
};

let currentTheme = localStorage.getItem('notichat_theme') || 'light';

function applyTheme(themeName) {
    document.body.className = `theme-${themeName}`;
    currentTheme = themeName;
    localStorage.setItem('notichat_theme', themeName);
    
    // Atualizar ícone do botão
    const themeButton = document.getElementById('toggleTheme');
    if (themeButton) {
        const icon = themeButton.querySelector('i');
        const span = themeButton.querySelector('span');
        
        const nextTheme = getNextTheme();
        icon.className = themes[nextTheme].icon;
        span.textContent = `Tema ${themes[nextTheme].name}`;
    }
}

function getNextTheme() {
    const themeKeys = Object.keys(themes);
    const currentIndex = themeKeys.indexOf(currentTheme);
    return themeKeys[(currentIndex + 1) % themeKeys.length];
}

function toggleThemeEnhanced() {
    const nextTheme = getNextTheme();
    applyTheme(nextTheme);
    showToast(`Tema alterado para ${themes[nextTheme].name}`, 'info');
}

// Atalhos de teclado
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Ctrl/Cmd + Enter para enviar mensagem
        if ((e.ctrlKey || e.metaKey) && e.key === 'Enter') {
            const form = document.getElementById('messageForm');
            if (form && !messageInput.disabled) {
                form.dispatchEvent(new Event('submit'));
            }
        }
        
        // Ctrl/Cmd + K para focar no input
        if ((e.ctrlKey || e.metaKey) && e.key === 'k') {
            e.preventDefault();
            messageInput.focus();
        }
        
        // Esc para fechar modals/dropdowns
        if (e.key === 'Escape') {
            userDropdown.classList.add('hidden');
            usersSidebar.classList.add('hidden');
            usersSidebar.classList.remove('show');
        }
    });
}

// Função de inicialização das melhorias
function initializeEnhancements() {
    console.log('🚀 Inicializando melhorias do NotiChat...');
    
    // Aplicar tema salvo
    applyTheme(currentTheme);
    
    // Configurar atalhos de teclado
    setupKeyboardShortcuts();
    
    // Carregar histórico
    if (currentUser) {
        messageHistory.load();
    }
    
    // Solicitar permissão para notificações
    requestNotificationPermission();
    
    // Adicionar listener de scroll nas mensagens
    if (messagesDiv) {
        messagesDiv.addEventListener('scroll', handleScrollMessages);
    }
    
    console.log('✅ Melhorias inicializadas!');
}

// Export das funções para uso global
window.initializeEnhancements = initializeEnhancements;
window.toggleThemeEnhanced = toggleThemeEnhanced;
window.addMessageToChatEnhanced = addMessageToChatEnhanced;
window.messageHistory = messageHistory;
