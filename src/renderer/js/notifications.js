// Renderer-side: request Notification permission if needed
if (typeof Notification !== 'undefined' && Notification.permission === 'default') {
  Notification.requestPermission();
}
// Note: actual scheduling is done in main.js via setInterval + Electron Notification API
