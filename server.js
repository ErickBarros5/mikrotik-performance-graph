const express = require('express');
const http = require('http');
const socketIo = require('socket.io');
const { RouterOSAPI } = require('node-routeros');

const app = express();
const server = http.createServer(app);
const io = socketIo(server);
const PORT = 3000;

const MIKROTIK_IP = '192.168.1.2';
const MIKROTIK_USER = 'admin';
const MIKROTIK_PASS = 'ifba123';
const INTERFACE_NAME = 'ether1';

app.use(express.static('root'));

server.listen(PORT, () => {
    console.log(`Servidor rodando em http://localhost:${PORT}`);
});

class MikrotikConnection {
    constructor() {
        this.connection = null;
        this.isConnected = false;
        this.lastRxBytes = 0;
        this.lastTxBytes = 0;
        this.lastTime = Date.now();
        this.isInitialized = false;
    }

    async connect() {
        try {
            console.log('Tentando conectar ao Mikrotik...');
            this.connection = new RouterOSAPI({
                host: MIKROTIK_IP,
                user: MIKROTIK_USER,
                password: MIKROTIK_PASS,
                timeout: 5000,
                keepalive: true
            });

            await this.connection.connect();
            this.isConnected = true;
            console.log('Conectado ao Mikrotik com sucesso!');
            return true;
        } catch (error) {
            console.error('Erro ao conectar ao Mikrotik:', error.message);
            this.isConnected = false;
            return false;
        }
    }

    async getInterfaceStats() {
        if (!this.isConnected) {
            const connected = await this.connect();
            if (!connected) {
                return null;
            }
        }

        try {
            const stats = await this.connection.write('/interface/print', [
                `?name=${INTERFACE_NAME}`,
                '=.proplist=rx-byte,tx-byte'
            ]);

            if (stats && stats.length > 0) {
                return {
                    rxBytes: parseInt(stats[0]['rx-byte']) || 0,
                    txBytes: parseInt(stats[0]['tx-byte']) || 0
                };
            }
            return null;
        } catch (error) {
            console.error('Erro ao obter estatísticas:', error.message);
            this.isConnected = false;
            return null;
        }
    }

    async getTrafficData() {
        const currentStats = await this.getInterfaceStats();
        if (!currentStats) {
            return { rx: 0, tx: 0, initialized: this.isInitialized };
        }

        if (!this.isInitialized) {
            console.log('Dados iniciais lidos, preparando para monitoramento...');
            this.lastRxBytes = currentStats.rxBytes;
            this.lastTxBytes = currentStats.txBytes;
            this.lastTime = Date.now();
            this.isInitialized = true;
            return { rx: 0, tx: 0, initialized: false };
        }

        const currentTime = Date.now();
        const timeDiff = (currentTime - this.lastTime) / 1000;

        if (timeDiff > 0) {
            const rxRate = Math.max(0, (currentStats.rxBytes - this.lastRxBytes) * 8 / timeDiff);
            const txRate = Math.max(0, (currentStats.txBytes - this.lastTxBytes) * 8 / timeDiff);

            this.lastRxBytes = currentStats.rxBytes;
            this.lastTxBytes = currentStats.txBytes;
            this.lastTime = currentTime;

            return {
                rx: Math.round(rxRate),
                tx: Math.round(txRate),
                initialized: true
            };
        }

        return { rx: 0, tx: 0, initialized: true };
    }

    close() {
        if (this.connection) {
            this.connection.close();
            this.isConnected = false;
        }
    }
}

io.on('connection', (socket) => {
    console.log('Cliente conectado:', socket.id);

    const mikrotik = new MikrotikConnection();
    let pollingInterval = null;

    const startMonitoring = async () => {
        const connected = await mikrotik.connect();
        if (!connected) {
            console.log('Tentando reconectar em 5 segundos...');
            setTimeout(startMonitoring, 5000);
            return;
        }

        pollingInterval = setInterval(async () => {
            try {
                const trafficData = await mikrotik.getTrafficData();
                
                socket.emit('bandwidth_update', {
                    time: new Date().getTime(),
                    rx: trafficData.rx,
                    tx: trafficData.tx
                });
            } catch (error) {
                console.error('Erro no polling:', error.message);
            }
        }, 1000);
    };

    startMonitoring();

    socket.on('disconnect', () => {
        console.log('Cliente desconectado:', socket.id);
        if (pollingInterval) {
            clearInterval(pollingInterval);
        }
        mikrotik.close();
    });
});
