// This file runs on Vercel's server (not in the browser)
// It securely generates upload permissions using your private key

const ImageKit = require("imagekit");

export default async function handler(req, res) {
    // Enable CORS for your frontend
    res.setHeader("Access-Control-Allow-Origin", "*");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    
    // Check if ImageKit keys are configured
    if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINT) {
        return res.status(500).json({ error: "ImageKit environment variables not configured on Vercel" });
    }
    
    try {
        const imagekit = new ImageKit({
            publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
            privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
        });
        
        const authParams = imagekit.getAuthenticationParameters();
        return res.status(200).json(authParams);
    } catch (error) {
        console.error("Auth endpoint error:", error);
        return res.status(500).json({ error: error.message });
    }
}
