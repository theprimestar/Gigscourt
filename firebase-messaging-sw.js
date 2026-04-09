// firebase-messaging-sw.js
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-app-compat.js');
importScripts('https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging-compat.js');

// Firebase configuration (synced with firebase-config.js)
const firebaseConfig = {
    apiKey: "AIzaSyAqvDHUPuGtZGMephb3dN_31eruuBXnbFE",
    authDomain: "gigscourt2.firebaseapp.com",
    projectId: "gigscourt2",
    storageBucket: "gigscourt2.firebasestorage.app",
    messagingSenderId: "505136313803",
    appId: "1:505136313803:web:2b61e6916efdaf8723324e"
};

firebase.initializeApp(firebaseConfig);
const messaging = firebase.messaging();

messaging.onBackgroundMessage((payload) => {
    console.log('Background message:', payload);
    
    const notificationTitle = payload.notification?.title || 'GigsCourt';
    const notificationOptions = {
        body: payload.notification?.body || 'You have a new notification',
        icon: '/icon-192.png',
        data: payload.data || {}
    };
    
    self.registration.showNotification(notificationTitle, notificationOptions);
});

self.addEventListener('notificationclick', (event) => {
    event.notification.close();
    const urlToOpen = event.notification.data?.url || '/';
    event.waitUntil(clients.openWindow(urlToOpen));
});
