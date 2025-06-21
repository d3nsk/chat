import { io, Socket } from 'socket.io-client';

export interface Message {
  id: string;
  content: string;
  from: string;
  to: string;
  timestamp: Date;
  isP2P: boolean;
}

export interface User {
  id: string;
  username: string;
}

export class WebRTCManager {
  private socket: Socket;
  private peerConnections: Map<string, RTCPeerConnection> = new Map();
  private dataChannels: Map<string, RTCDataChannel> = new Map();
  private username: string = '';
  private onMessageCallback?: (message: Message) => void;
  private onUserListCallback?: (users: User[]) => void;
  private onUserJoinedCallback?: (user: User) => void;
  private onUserLeftCallback?: (userId: string) => void;

  constructor(serverUrl: string = 'http://localhost:3001') {
    this.socket = io(serverUrl);
    this.setupSocketListeners();
  }

  private setupSocketListeners(): void {
    this.socket.on('userList', (users: [string, string][]) => {
      const userList: User[] = users
        .filter(([id]) => id !== this.socket.id)
        .map(([id, username]) => ({ id, username }));
      
      if (this.onUserListCallback) {
        this.onUserListCallback(userList);
      }
    });

    this.socket.on('userJoined', (user: User) => {
      if (this.onUserJoinedCallback) {
        this.onUserJoinedCallback(user);
      }
    });

    this.socket.on('userLeft', (data: { id: string; username: string }) => {
      this.closeConnection(data.id);
      if (this.onUserLeftCallback) {
        this.onUserLeftCallback(data.id);
      }
    });

    this.socket.on('offer', async (data: { offer: RTCSessionDescriptionInit; from: string }) => {
      await this.handleOffer(data.from, data.offer);
    });

    this.socket.on('answer', async (data: { answer: RTCSessionDescriptionInit; from: string }) => {
      await this.handleAnswer(data.from, data.answer);
    });

    this.socket.on('ice-candidate', (data: { candidate: RTCIceCandidateInit; from: string }) => {
      this.handleIceCandidate(data.from, data.candidate);
    });

    this.socket.on('message', (data: { message: string; from: string; username: string }) => {
      const message: Message = {
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

  public join(username: string): void {
    this.username = username;
    this.socket.emit('join', username);
  }

  public async connectToPeer(peerId: string): Promise<void> {
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

  private async handleOffer(from: string, offer: RTCSessionDescriptionInit): Promise<void> {
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

  private async handleAnswer(from: string, answer: RTCSessionDescriptionInit): Promise<void> {
    const peerConnection = this.peerConnections.get(from);
    if (peerConnection) {
      try {
        await peerConnection.setRemoteDescription(answer);
      } catch (error) {
        console.error('Error handling answer:', error);
      }
    }
  }

  private handleIceCandidate(from: string, candidate: RTCIceCandidateInit): void {
    const peerConnection = this.peerConnections.get(from);
    if (peerConnection) {
      try {
        peerConnection.addIceCandidate(candidate);
      } catch (error) {
        console.error('Error adding ICE candidate:', error);
      }
    }
  }

  private setupDataChannel(dataChannel: RTCDataChannel, peerId: string): void {
    this.dataChannels.set(peerId, dataChannel);

    dataChannel.onopen = () => {
      console.log(`Data channel opened with ${peerId}`);
    };

    dataChannel.onmessage = (event) => {
      const message: Message = {
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

  public sendMessage(to: string, content: string): void {
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

  public closeConnection(peerId: string): void {
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

  public disconnect(): void {
    this.peerConnections.forEach((connection, peerId) => {
      this.closeConnection(peerId);
    });
    this.socket.disconnect();
  }

  // コールバックの設定
  public onMessage(callback: (message: Message) => void): void {
    this.onMessageCallback = callback;
  }

  public onUserList(callback: (users: User[]) => void): void {
    this.onUserListCallback = callback;
  }

  public onUserJoined(callback: (user: User) => void): void {
    this.onUserJoinedCallback = callback;
  }

  public onUserLeft(callback: (userId: string) => void): void {
    this.onUserLeftCallback = callback;
  }

  public getUsername(): string {
    return this.username;
  }

  public getSocketId(): string {
    return this.socket.id || '';
  }
} 