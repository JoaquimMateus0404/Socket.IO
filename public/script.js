const socket = io();

const messagesDiv = document.getElementById('messages');
const messageForm = document.getElementById('messageForm');
const messageInput = document.getElementById('messageInput');

// Função para adicionar mensagem na tela
function addMessage(message) {
    const messageElement = document.createElement('div');
    messageElement.classList.add('message');
    messageElement.textContent = message;
    messagesDiv.appendChild(messageElement);
    messagesDiv.scrollTop = messagesDiv.scrollHeight;
}

// Enviar mensagem
messageForm.addEventListener('submit', (e) => {
    e.preventDefault();
    const message = messageInput.value.trim();
    
    if (message) {
        socket.emit('chat message', message);
        messageInput.value = '';
    }
});

// Receber mensagens
socket.on('chat message', (msg) => {
    addMessage(msg);
});

// Eventos de conexão
socket.on('connect', () => {
    console.log('Conectado ao servidor');
    addMessage('Você se conectou ao chat!');
});

socket.on('disconnect', () => {
    console.log('Desconectado do servidor');
    addMessage('Você foi desconectado do chat!');
});
