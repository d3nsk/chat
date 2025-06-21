// Socket.IOはグローバルに利用可能であることを前提とする
// CDNからのインポートを削除

export class WebRTCManager {
    constructor(serverUrl = null) {
        // サーバーURLの決定（環境変数 > 引数 > デフォルト）
        const url = serverUrl || process.env.SIGNALING_SERVER_URL || 'http://localhost:3001';
        
        // Socket.IOがグローバルに利用可能かチェック
        if (typeof io === 'undefined') {
            throw new Error('Socket.IO is not loaded. Please include socket.io-client in your HTML.');
        }
        
        this.socket = io(url);
        this.peerConnections = new Map();
        this.dataChannels = new Map();
        this.username = '';
        this.onMessageCallback = null;
        this.onUserListCallback = null;
        this.onUserJoinedCallback = null;
        this.onUserLeftCallback = null;
        
        this.setupSocketListeners();
    }

    setupSocketListeners() {
        this.socket.on('userList', (users) => {
            const userList = users
                .filter(([id]) => id !== this.socket.id)
                .map(([id, username]) => ({ id, username }));
            
            if (this.onUserListCallback) {
                this.onUserListCallback(userList);
            }
        });

        this.socket.on('userJoined', (user) => {
            if (this.onUserJoinedCallback) {
                this.onUserJoinedCallback(user);
            }
        });

        this.socket.on('userLeft', (data) => {
            this.closeConnection(data.id);
            if (this.onUserLeftCallback) {
                this.onUserLeftCallback(data.id);
            }
        });

        this.socket.on('offer', async (data) => {
            await this.handleOffer(data.from, data.offer);
        });

        this.socket.on('answer', async (data) => {
            await this.handleAnswer(data.from, data.answer);
        });

        this.socket.on('ice-candidate', (data) => {
            this.handleIceCandidate(data.from, data.candidate);
        });

        this.socket.on('message', (data) => {
            const message = {
                id: Date.now().toString(),
                content: data.message,
                from: data.from,
                to: this.socket.id || '',
                timestamp: new Date(),
                isP2P: false
            };
            
            if (this.onMessageCallback) {
                this.onMessageCallback(message);
            }
        });
    }

    join(username) {
        this.username = username;
        this.socket.emit('join', username);
    }

    async connectToPeer(peerId) {
        if (this.peerConnections.has(peerId)) {
            return;
        }

        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });

        this.peerConnections.set(peerId, peerConnection);

        // データチャンネルの作成
        const dataChannel = peerConnection.createDataChannel('chat');
        this.setupDataChannel(dataChannel, peerId);

        // ICE candidateの処理
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    target: peerId,
                    candidate: event.candidate
                });
            }
        };

        // Offerの作成と送信
        try {
            const offer = await peerConnection.createOffer();
            await peerConnection.setLocalDescription(offer);
            
            this.socket.emit('offer', {
                target: peerId,
                offer: offer
            });
        } catch (error) {
            console.error('Error creating offer:', error);
        }
    }

    async handleOffer(from, offer) {
        const peerConnection = new RTCPeerConnection({
            iceServers: [
                { urls: 'stun:stun.l.google.com:19302' },
                { urls: 'stun:stun1.l.google.com:19302' }
            ]
        });

        this.peerConnections.set(from, peerConnection);

        // データチャンネルの受信
        peerConnection.ondatachannel = (event) => {
            this.setupDataChannel(event.channel, from);
        };

        // ICE candidateの処理
        peerConnection.onicecandidate = (event) => {
            if (event.candidate) {
                this.socket.emit('ice-candidate', {
                    target: from,
                    candidate: event.candidate
                });
            }
        };

        try {
            await peerConnection.setRemoteDescription(offer);
            const answer = await peerConnection.createAnswer();
            await peerConnection.setLocalDescription(answer);
            
            this.socket.emit('answer', {
                target: from,
                answer: answer
            });
        } catch (error) {
            console.error('Error handling offer:', error);
        }
    }

    async handleAnswer(from, answer) {
        const peerConnection = this.peerConnections.get(from);
        if (peerConnection) {
            try {
                await peerConnection.setRemoteDescription(answer);
            } catch (error) {
                console.error('Error handling answer:', error);
            }
        }
    }

    handleIceCandidate(from, candidate) {
        const peerConnection = this.peerConnections.get(from);
        if (peerConnection) {
            try {
                peerConnection.addIceCandidate(candidate);
            } catch (error) {
                console.error('Error adding ICE candidate:', error);
            }
        }
    }

    setupDataChannel(dataChannel, peerId) {
        this.dataChannels.set(peerId, dataChannel);

        dataChannel.onopen = () => {
            console.log(`Data channel opened with ${peerId}`);
        };

        dataChannel.onmessage = (event) => {
            const message = {
                id: Date.now().toString(),
                content: event.data,
                from: peerId,
                to: this.socket.id || '',
                timestamp: new Date(),
                isP2P: true
            };
            
            if (this.onMessageCallback) {
                this.onMessageCallback(message);
            }
        };

        dataChannel.onclose = () => {
            console.log(`Data channel closed with ${peerId}`);
            this.dataChannels.delete(peerId);
        };
    }

    sendMessage(to, content) {
        const dataChannel = this.dataChannels.get(to);
        
        if (dataChannel && dataChannel.readyState === 'open') {
            // P2P接続が確立されている場合は直接送信
            dataChannel.send(content);
        } else {
            // フォールバック: サーバー経由で送信
            this.socket.emit('message', {
                target: to,
                message: content
            });
        }
    }

    closeConnection(peerId) {
        const peerConnection = this.peerConnections.get(peerId);
        if (peerConnection) {
            peerConnection.close();
            this.peerConnections.delete(peerId);
        }

        const dataChannel = this.dataChannels.get(peerId);
        if (dataChannel) {
            dataChannel.close();
            this.dataChannels.delete(peerId);
        }
    }

    disconnect() {
        this.peerConnections.forEach((connection, peerId) => {
            this.closeConnection(peerId);
        });
        this.socket.disconnect();
    }

    // コールバックの設定
    onMessage(callback) {
        this.onMessageCallback = callback;
    }

    onUserList(callback) {
        this.onUserListCallback = callback;
    }

    onUserJoined(callback) {
        this.onUserJoinedCallback = callback;
    }

    onUserLeft(callback) {
        this.onUserLeftCallback = callback;
    }

    getUsername() {
        return this.username;
    }

    getSocketId() {
        return this.socket.id || '';
    }
} 