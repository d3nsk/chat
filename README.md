# P2P Chat System

TypeScript と WebRTC を使用した P2P（Peer-to-Peer）チャットシステムです。ユーザー間で直接通信を行い、サーバーを経由せずにメッセージを送受信できます。

## 特徴

- **P2P 通信**: WebRTC を使用した直接通信
- **フォールバック機能**: P2P 接続が確立されない場合はサーバー経由で通信
- **リアルタイム**: Socket.IO を使用したリアルタイム接続
- **モダン UI**: レスポンシブデザインの美しいインターフェース
- **TypeScript**: 型安全性を保証

## 技術スタック

- **フロントエンド**: HTML5, CSS3, JavaScript (ES6+)
- **バックエンド**: Node.js, Express, Socket.IO
- **P2P 通信**: WebRTC
- **開発環境**: TypeScript, Vite

## アーキテクチャ

```
┌─────────────┐    ┌─────────────┐    ┌─────────────┐
│   Client A  │◄──►│  Signaling  │◄──►│   Client B  │
│  (Browser)  │    │   Server    │    │  (Browser)  │
└─────────────┘    └─────────────┘    └─────────────┘
       │                   │                   │
       └───────────────────┼───────────────────┘
                           │
                    ┌─────────────┐
                    │ STUN/TURN   │
                    │   Server    │
                    └─────────────┘
```

## セットアップ

### 前提条件

- Node.js (v16 以上)
- npm

### インストール

1. リポジトリをクローン

```bash
git clone <repository-url>
cd p2p-chat
```

2. 依存関係をインストール

```bash
npm install
```

3. サーバーを起動

```bash
npm run dev:server
```

4. 別のターミナルでクライアントを起動

```bash
npm run dev:client
```

5. ブラウザで `http://localhost:3000` にアクセス

## 使用方法

1. **ログイン**: ユーザー名を入力してチャットに参加
2. **ユーザー選択**: 左側のユーザーリストからチャット相手を選択
3. **P2P 接続**: ユーザーを選択すると自動的に P2P 接続が確立されます
4. **メッセージ送信**: メッセージを入力して送信
5. **接続状態確認**: メッセージの横に「P2P」または「Server」の表示で通信方式を確認

## 通信方式

### P2P 通信（推奨）

- WebRTC Data Channel を使用
- サーバーを経由しない直接通信
- 低遅延、高プライバシー

### サーバー経由通信（フォールバック）

- P2P 接続が確立できない場合の代替手段
- Socket.IO を使用
- サーバーを経由するため若干の遅延

## ファイル構造

```
p2p-chat/
├── src/
│   ├── server.ts          # シグナリングサーバー
│   └── WebRTCManager.ts   # WebRTC接続管理
├── public/
│   ├── index.html         # メインHTML
│   ├── styles.css         # スタイルシート
│   ├── app.js            # クライアントアプリケーション
│   └── WebRTCManager.js  # ブラウザ用WebRTCManager
├── package.json
├── tsconfig.json
├── vite.config.ts
└── README.md
```

## 開発

### スクリプト

- `npm run dev:server`: シグナリングサーバーを開発モードで起動
- `npm run dev:client`: Vite 開発サーバーを起動
- `npm run build`: TypeScript をコンパイル
- `npm start`: 本番サーバーを起動

### カスタマイズ

- **STUN/TURN サーバー**: `WebRTCManager.ts`の`iceServers`を変更
- **ポート設定**: `server.ts`の`PORT`変数を変更
- **UI**: `styles.css`を編集

## トラブルシューティング

### P2P 接続が確立されない場合

1. ファイアウォールの設定を確認
2. NAT 環境でのポート開放
3. STUN/TURN サーバーの設定を確認

### メッセージが送信されない場合

1. ブラウザのコンソールでエラーを確認
2. ネットワーク接続を確認
3. サーバーが正常に起動しているか確認

## セキュリティ

- HTTPS 環境での使用を推奨
- メッセージの暗号化は実装されていません
- 本番環境では適切な認証・認可を実装してください

## ライセンス

MIT License

## 貢献

プルリクエストやイシューの報告を歓迎します。
