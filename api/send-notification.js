// api/send-notification.js
import { getMessaging } from 'firebase-admin/messaging';
import { initializeApp, cert } from 'firebase-admin/app';

// Initialize Firebase Admin SDK
let app;
if (!global.firebaseAdminApp) {
    const serviceAccount = {
        projectId: process.env.FIREBASE_PROJECT_ID,
        clientEmail: process.env.FIREBASE_CLIENT_EMAIL,
        privateKey: process.env.FIREBASE_PRIVATE_KEY?.replace(/\\n/g, '\n'),
    };
    
    app = initializeApp({
        credential: cert(serviceAccount)
    });
    global.firebaseAdminApp = app;
} else {
    app = global.firebaseAdminApp;
}

export default async function handler(req, res) {
    // Only allow POST requests
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }
    
    const { userId, title, body, data, clickAction } = req.body;
    
    if (!userId || !title || !body) {
        return res.status(400).json({ error: 'Missing required fields: userId, title, body' });
    }
    
    try {
        // Get user's FCM token from Firestore
        const db = getFirestore();
        const userDoc = await db.collection('users').doc(userId).get();
        const fcmToken = userDoc.data()?.fcmToken;
        
        if (!fcmToken) {
            return res.status(200).json({ message: 'No FCM token found for user' });
        }
        
        const message = {
            token: fcmToken,
            notification: {
                title: title,
                body: body
            },
            data: {
                ...data,
                click_action: clickAction || '/',
                url: clickAction || '/'
            },
            webpush: {
                fcmOptions: {
                    link: clickAction || '/'
                }
            }
        };
        
        const messaging = getMessaging(app);
        const response = await messaging.send(message);
        
        res.status(200).json({ success: true, messageId: response });
    } catch (error) {
        console.error('FCM send error:', error);
        res.status(500).json({ error: error.message });
    }
}

// Helper to get Firestore (lazy import to avoid initialization issues)
let dbInstance = null;
function getFirestore() {
    if (!dbInstance) {
        const { getFirestore } = require('firebase-admin/firestore');
        dbInstance = getFirestore(app);
    }
    return dbInstance;
}
