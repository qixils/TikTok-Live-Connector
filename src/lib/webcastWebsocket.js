const { EventEmitter } = require('node:events');

const Config = require('./webcastConfig.js');
const WebSocketClient = require('websocket').client;
const { deserializeWebsocketMessage, serializeMessage } = require('./webcastProtobuf.js');

class WebcastWebsocket extends EventEmitter {
    constructor(wsUrl, cookieJar, clientParams, wsParams, customHeaders, websocketOptions) {
        super();
        this.client = new WebSocketClient();
        this.pingInterval = null;
        this.connection = null;
        this.wsParams = { ...clientParams, ...wsParams };
        this.wsUrlWithParams = `${wsUrl}?${new URLSearchParams(this.wsParams)}`;
        this.wsHeaders = {
            Cookie: cookieJar.getCookieString(),
            ...(customHeaders || {}),
        };

        this.#handleEvents();
        this.client.connect(this.wsUrlWithParams, 'echo-protocol', Config.TIKTOK_URL_WEBCAST, this.wsHeaders, websocketOptions);
    }

    #handleEvents() {
        this.client.on('connect', (wsConnection) => this.emit('connect', wsConnection));
        this.client.on('connectFailed', (err) => this.emit('connectFailed', err));

        this.on('connect', (wsConnection) => {
            this.connection = wsConnection;
            this.pingInterval = setInterval(() => this.#sendPing(), 10000);

            wsConnection.on('message', (message) => {
                if (message.type === 'binary') {
                    this.#handleMessage(message);
                }
            });

            wsConnection.on('close', () => {
                clearInterval(this.pingInterval);
            });
        });
    }

    async #handleMessage(message) {
        try {
            let decodedContainer = await deserializeWebsocketMessage(message.binaryData);

            if (decodedContainer.id > 0) {
                this.#sendAck(decodedContainer.id);
            }

            // Emit 'WebcastResponse' from ws message container if decoding success
            if (typeof decodedContainer.webcastResponse === 'object') {
                this.emit('webcastResponse', decodedContainer.webcastResponse);
            }
        } catch (err) {
            this.emit('messageDecodingFailed', err);
        }
    }

    #sendPing() {
        // Send static connection alive ping
        this.connection.sendBytes(Buffer.from('3A026862', 'hex'));
    }

    #sendAck(id) {
        let ackMsg = serializeMessage('WebcastWebsocketAck', { type: 'ack', id });
        this.connection.sendBytes(Buffer.from(ackMsg));
    }
}

module.exports = WebcastWebsocket;
