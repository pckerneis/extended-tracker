import WebSocket from 'ws';

const wss = new WebSocket.Server({ port: 9000 });

wss.on('connection', (ws) => {
    ws.on('message', (data) => {
        wss.clients.forEach((client) => {
            if (client !== ws && client.readyState === WebSocket.OPEN) {
                client.send(data);
            }
        });
    });
});

console.log('WebSocket server ready to broadcast on port 9000');