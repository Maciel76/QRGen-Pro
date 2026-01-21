const http = require('http');
const fs = require('fs');
const path = require('path');

const port = 8080;
const hostname = '127.0.0.1';

// MIME types for different file extensions
const mimeTypes = {
  '.html': 'text/html',
  '.css': 'text/css',
  '.js': 'text/javascript',
  '.json': 'application/json',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.gif': 'image/gif',
  '.svg': 'image/svg+xml',
  '.ico': 'image/x-icon',
  '.txt': 'text/plain',
  '.csv': 'text/csv'
};

const server = http.createServer((req, res) => {
  console.log(`Request received: ${req.method} ${req.url}`);
  
  // Handle root path
  let filePath = req.url === '/' ? '/test-pwa.html' : req.url;
  
  // Resolve the path to prevent directory traversal
  filePath = path.resolve('.') + filePath;
  
  // Get the file extension
  const extname = path.extname(filePath).toLowerCase();
  const contentType = mimeTypes[extname] || 'application/octet-stream';
  
  // Read the file
  fs.readFile(filePath, (err, content) => {
    if (err) {
      if (err.code === 'ENOENT') {
        // File not found
        console.error(`File not found: ${filePath}`);
        res.writeHead(404);
        res.end('404 Not Found');
      } else {
        // Server error
        console.error(`Server error: ${err.code}`);
        res.writeHead(500);
        res.end('500 Internal Server Error');
      }
    } else {
      // Success
      res.writeHead(200, { 'Content-Type': contentType });
      res.end(content, 'utf-8');
    }
  });
});

server.listen(port, hostname, () => {
  console.log(`Servidor rodando em http://${hostname}:${port}/`);
  console.log('Pressione Ctrl+C para encerrar o servidor.');
});