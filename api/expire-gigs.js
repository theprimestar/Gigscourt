// api/expire-gigs.js
// This function runs once per day on Vercel's servers
// It checks for expired gigs and cancels them

import { initializeApp, cert } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

// Initialize Firebase Admin SDK (this runs on Vercel server, not in browser)
let app;
if (!global.firebaseAdminApp) {
    // For Vercel, we use environment variables for the service account
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

const db = getFirestore(app);

export default async function handler(req, res) {
    // SECURITY: Only allow requests with the correct secret key
    // This prevents anyone from calling this function manually
    const authHeader = req.headers.authorization;
    const expectedSecret = process.env.CRON_SECRET;
    
    if (!expectedSecret || authHeader !== `Bearer ${expectedSecret}`) {
        return res.status(401).json({ error: 'Unauthorized' });
    }
    
    try {
        const now = new Date().toISOString();
        
        // Find all gigs that are:
        // 1. Still pending review (not completed or cancelled)
        // 2. Expired (expiresAt is older than now)
        const gigsRef = db.collection('gigs');
        const expiredGigs = await gigsRef
            .where('status', '==', 'pending_review')
            .where('expiresAt', '<', now)
            .get();
        
        let cancelledCount = 0;
        
        // Loop through each expired gig and cancel it
        for (const doc of expiredGigs.docs) {
            const gigData = doc.data();
            
            // Update gig status to cancelled
            await doc.ref.update({ status: 'cancelled' });
            
            // Update the chat room to remove the pending review badge
            const chatRef = db.collection('chats').doc(gigData.chatId);
            await chatRef.update({ pendingReview: false });
            
            cancelledCount++;
        }
        
        // Return success response
        res.status(200).json({ 
            success: true, 
            cancelled: cancelledCount,
            message: `Cancelled ${cancelledCount} expired gigs`
        });
    } catch (error) {
        console.error('Expiry check error:', error);
        res.status(500).json({ error: error.message });
    }
}
