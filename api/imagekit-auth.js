// ImageKit Authentication Endpoint
// PUBLIC - No login required (guests can upload during signup)

const ImageKit = require("imagekit");

export default async function handler(req, res) {
    // Allow requests from your frontend
    res.setHeader("Access-Control-Allow-Origin", "https://gigscourt2.vercel.app");
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    
    // Check required environment variables
    if (!process.env.IMAGEKIT_PUBLIC_KEY || !process.env.IMAGEKIT_PRIVATE_KEY || !process.env.IMAGEKIT_URL_ENDPOINT) {
        return res.status(500).json({ error: "ImageKit not configured on server" });
    }
    
    try {
        const imagekit = new ImageKit({
            publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
            privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
            urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
        });
        
        const authParams = imagekit.getAuthenticationParameters();
        res.status(200).json(authParams);
    } catch (error) {
        console.error("Auth error:", error);
        res.status(500).json({ error: error.message });
    }
}
