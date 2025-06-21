import { WebRTCManager } from './WebRTCManager.js';

class ChatApp {
    constructor() {
        // グローバル変数からサーバーURLを取得
        const serverUrl = window.SIGNALING_SERVER_URL || 'http://localhost:3001';
        this.webrtcManager = new WebRTCManager(serverUrl);
        this.selectedUser = null;
        this.users = new Map();
        
        this.initializeElements();
        this.setupEventListeners();
        this.setupWebRTCCallbacks();
    }

    initializeElements() {
        // ログイン画面の要素
        this.loginScreen = document.getElementById('loginScreen');
        this.chatScreen = document.getElementById('chatScreen');
        this.usernameInput = document.getElementById('usernameInput');
        this.joinButton = document.getElementById('joinButton');

        // チャット画面の要素
        this.currentUserSpan = document.getElementById('currentUser');
        this.disconnectButton = document.getElementById('disconnectButton');
        this.usersList = document.getElementById('usersList');
        this.messagesContainer = document.getElementById('messagesContainer');
        this.messageInput = document.getElementById('messageInput');
        this.sendButton = document.getElementById('sendButton');
        this.connectionStatus = document.getElementById('connectionStatus');
    }

    setupEventListeners() {
        // ログイン関連
        this.joinButton.addEventListener('click', () => this.joinChat());
        this.usernameInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.joinChat();
        });

        // チャット関連
        this.disconnectButton.addEventListener('click', () => this.disconnect());
        this.sendButton.addEventListener('click', () => this.sendMessage());
        this.messageInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.sendMessage();
        });
    }

    setupWebRTCCallbacks() {
        this.webrtcManager.onMessage((message) => {
            this.displayMessage(message);
        });

        this.webrtcManager.onUserList((users) => {
            this.updateUsersList(users);
        });

        this.webrtcManager.onUserJoined((user) => {
            this.addUser(user);
        });

        this.webrtcManager.onUserLeft((userId) => {
            this.removeUser(userId);
        });
    }

    joinChat() {
        const username = this.usernameInput.value.trim();
        if (!username) {
            alert('ユーザー名を入力してください');
            return;
        }

        this.webrtcManager.join(username);
        this.showChatScreen();
        this.currentUserSpan.textContent = username;
        this.updateConnectionStatus('接続中...');
    }

    showChatScreen() {
        this.loginScreen.classList.add('hidden');
        this.chatScreen.classList.remove('hidden');
        this.messageInput.disabled = false;
        this.sendButton.disabled = false;
    }

    showLoginScreen() {
        this.chatScreen.classList.add('hidden');
        this.loginScreen.classList.remove('hidden');
        this.messageInput.disabled = true;
        this.sendButton.disabled = true;
        this.usernameInput.value = '';
        this.users.clear();
        this.selectedUser = null;
        this.updateUsersList([]);
        this.clearMessages();
    }

    disconnect() {
        this.webrtcManager.disconnect();
        this.showLoginScreen();
    }

    updateUsersList(users) {
        this.users.clear();
        this.usersList.innerHTML = '';

        users.forEach(user => {
            this.users.set(user.id, user);
            this.addUserElement(user);
        });
    }

    addUser(user) {
        this.users.set(user.id, user);
        this.addUserElement(user);
    }

    removeUser(userId) {
        this.users.delete(userId);
        const userElement = document.querySelector(`[data-user-id="${userId}"]`);
        if (userElement) {
            userElement.remove();
        }
        
        if (this.selectedUser === userId) {
            this.selectedUser = null;
            this.updateConnectionStatus('ユーザーを選択してください');
        }
    }

    addUserElement(user) {
        const userElement = document.createElement('div');
        userElement.className = 'user-item';
        userElement.setAttribute('data-user-id', user.id);
        userElement.innerHTML = `
            <span class="username">${user.username}</span>
            <span class="status">オンライン</span>
        `;

        userElement.addEventListener('click', () => {
            this.selectUser(user.id);
        });

        this.usersList.appendChild(userElement);
    }

    selectUser(userId) {
        // 前の選択を解除
        const prevSelected = this.usersList.querySelector('.user-item.selected');
        if (prevSelected) {
            prevSelected.classList.remove('selected');
        }

        // 新しい選択を設定
        const userElement = this.usersList.querySelector(`[data-user-id="${userId}"]`);
        if (userElement) {
            userElement.classList.add('selected');
        }

        this.selectedUser = userId;
        const user = this.users.get(userId);
        this.updateConnectionStatus(`${user.username} と接続中...`);

        // WebRTC接続を確立
        this.webrtcManager.connectToPeer(userId);
    }

    sendMessage() {
        if (!this.selectedUser) {
            alert('メッセージを送信するユーザーを選択してください');
            return;
        }

        const content = this.messageInput.value.trim();
        if (!content) return;

        this.webrtcManager.sendMessage(this.selectedUser, content);
        
        // 送信したメッセージを表示
        const message = {
            id: Date.now().toString(),
            content: content,
            from: this.webrtcManager.getSocketId(),
            to: this.selectedUser,
            timestamp: new Date(),
            isP2P: true
        };
        
        this.displayMessage(message);
        this.messageInput.value = '';
    }

    displayMessage(message) {
        const messageElement = document.createElement('div');
        const isSent = message.from === this.webrtcManager.getSocketId();
        
        messageElement.className = `message ${isSent ? 'sent' : 'received'}`;
        
        const timeString = message.timestamp.toLocaleTimeString('ja-JP', {
            hour: '2-digit',
            minute: '2-digit'
        });

        const user = this.users.get(message.from);
        const username = user ? user.username : 'Unknown';

        messageElement.innerHTML = `
            <div class="message-info">
                <span>${isSent ? 'あなた' : username}</span>
                <span class="message-time">${timeString}</span>
                <span class="message-type">${message.isP2P ? 'P2P' : 'Server'}</span>
            </div>
            <div class="message-content">${this.escapeHtml(message.content)}</div>
        `;

        this.messagesContainer.appendChild(messageElement);
        this.scrollToBottom();
    }

    clearMessages() {
        this.messagesContainer.innerHTML = '';
    }

    scrollToBottom() {
        this.messagesContainer.scrollTop = this.messagesContainer.scrollHeight;
    }

    updateConnectionStatus(status) {
        this.connectionStatus.textContent = status;
    }

    escapeHtml(text) {
        const div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }
}

// アプリケーションの初期化
document.addEventListener('DOMContentLoaded', () => {
    new ChatApp();
}); 