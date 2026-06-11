#!/usr/bin/env node

/**
 * Einfacher lokaler HTTP-Server für Serienbrief-Generator
 * Installieren Sie http-server global: npm install -g http-server
 * Oder lokal: npm install http-server
 */

const fs = require('fs');
const path = require('path');
const http = require('http');

const PORT = 8000;
const MIME_TYPES = {
    '.html': 'text/html',
    '.js': 'application/javascript',
    '.css': 'text/css',
    '.json': 'application/json',
    '.csv': 'text/csv',
    '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'
};

const server = http.createServer((req, res) => {
    // Gebe Root-Verzeichnis aus
    let filePath = path.join(__dirname, req.url === '/' ? 'index.html' : req.url);
    
    // Verhindere Directory Traversal
    if (!filePath.startsWith(__dirname)) {
        res.writeHead(403, { 'Content-Type': 'text/plain' });
        res.end('Forbidden');
        return;
    }

    // Versuche Datei zu lesen
    fs.readFile(filePath, (err, data) => {
        if (err) {
            if (err.code === 'ENOENT') {
                res.writeHead(404, { 'Content-Type': 'text/plain' });
                res.end('404 Not Found');
            } else {
                res.writeHead(500, { 'Content-Type': 'text/plain' });
                res.end('500 Server Error');
            }
            return;
        }

        // Bestimme MIME-Type
        const ext = path.extname(filePath).toLowerCase();
        const mimeType = MIME_TYPES[ext] || 'application/octet-stream';

        // Setze Header
        res.writeHead(200, {
            'Content-Type': mimeType,
            'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
            'Pragma': 'no-cache'
        });

        res.end(data);
    });
});

server.listen(PORT, () => {
    console.log(`🚀 Serienbrief-Generator Server`);
    console.log(`📁 Verzeichnis: ${__dirname}\n`);
    console.log(`✓ Server läuft auf http://localhost:${PORT}`);
    console.log(`✓ Drücken Sie STRG+C zum Beenden\n`);
    
    // Versuche Browser zu öffnen
    try {
        const { exec } = require('child_process');
        const open = process.platform === 'darwin' ? 'open' : 
                     process.platform === 'win32' ? 'start' : 'xdg-open';
        exec(`${open} http://localhost:${PORT}`);
        console.log(`✓ Browser wird geöffnet...\n`);
    } catch (e) {
        console.log(`⚠ Browser konnte nicht automatisch geöffnet werden\n`);
    }
});

process.on('SIGINT', () => {
    console.log('\n✓ Server beendet.');
    process.exit(0);
});
