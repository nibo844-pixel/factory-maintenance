const { app, BrowserWindow, Menu } = require('electron');
const { spawn } = require('child_process');
const path = require('path');
const http = require('http');

let serverProcess = null;
let mainWindow = null;

// Wait for server to be ready before opening window
function waitForServer(url, retries = 30) {
    return new Promise((resolve, reject) => {
        const check = (attempt) => {
            const req = http.get(url, (res) => {
                if (res.statusCode === 200 || res.statusCode === 302) resolve();
                else retry(attempt);
            });
            req.on('error', () => retry(attempt));
        };
        const retry = (attempt) => {
            if (attempt >= retries) reject(new Error('Server did not start'));
            else setTimeout(() => check(attempt + 1), 500);
        };
        check(0);
    });
}

function createWindow() {
    mainWindow = new BrowserWindow({
        width: 1280,
        height: 800,
        minWidth: 900,
        minHeight: 600,
        icon: path.join(__dirname, 'public', 'img', 'icon.png'),
        title: '🏭 Factory Maintenance',
        autoHideMenuBar: true,
        webPreferences: {
            nodeIntegration: false,
            contextIsolation: true
        }
    });

    // Load the app
    mainWindow.loadURL('http://localhost:3000');

    // Remove menu bar completely for cleaner look
    Menu.setApplicationMenu(null);
}

app.whenReady().then(async () => {
    // Start the Node.js server as a child process
    serverProcess = spawn(process.execPath, [path.join(__dirname, 'server.js')], {
        env: { ...process.env, ELECTRON_RUN_AS_NODE: '1' },
        stdio: 'pipe',
        detached: false
    });

    serverProcess.stdout.on('data', (data) => console.log(`[Server] ${data}`));
    serverProcess.stderr.on('data', (data) => console.error(`[Server Error] ${data}`));

    try {
        await waitForServer('http://localhost:3000');
        createWindow();
    } catch(err) {
        console.error('Failed to start:', err);
        app.quit();
    }

    app.on('activate', () => {
        if (BrowserWindow.getAllWindows().length === 0) createWindow();
    });
});

// Quit: kill server when Electron closes
app.on('window-all-closed', () => {
    if (serverProcess) serverProcess.kill();
    app.quit();
});

app.on('before-quit', () => {
    if (serverProcess) serverProcess.kill();
});
