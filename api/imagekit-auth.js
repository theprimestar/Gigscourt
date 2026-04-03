import ImageKit from 'imagekit';

export default async function handler(req, res) {
    res.setHeader("Access-Control-Allow-Origin", "*");
    
    if (req.method === "OPTIONS") {
        return res.status(200).end();
    }
    
    const imagekit = new ImageKit({
        publicKey: process.env.IMAGEKIT_PUBLIC_KEY,
        privateKey: process.env.IMAGEKIT_PRIVATE_KEY,
        urlEndpoint: process.env.IMAGEKIT_URL_ENDPOINT,
    });
    
    try {
        const authParams = imagekit.getAuthenticationParameters();
        res.status(200).json(authParams);
    } catch (error) {
        res.status(500).json({ error: error.message });
    }
}
