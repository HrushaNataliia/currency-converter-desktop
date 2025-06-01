const { contextBridge } = require('electron');

contextBridge.exposeInMainWorld('env', {
    PRIMARY_API_URL: 'https://api.exchangerate.host',
    FALLBACK_API_URL: 'https://api.exchangerate-api.com/v4',
});