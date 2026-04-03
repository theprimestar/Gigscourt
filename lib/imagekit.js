// ========================================
// GigsCourt ImageKit Integration
// NO NAMESPACE COLLISION - uses ImageKitService
// ========================================

const IK_PUBLIC_KEY = "public_hwM9hldZI+DqFY/pncPQCA5VRWo=";
const IK_URL_ENDPOINT = "https://ik.imagekit.io/Theprimestar";
const IK_AUTH_ENDPOINT = "https://gigscourt2.vercel.app/api/imagekit-auth";

let imagekitInstance = null;

async function getImageKit() {
    if (imagekitInstance) return imagekitInstance;
    
    // Wait for SDK to be ready (up to 5 seconds)
    let attempts = 0;
    while (typeof window.ImageKit === 'undefined' && attempts < 50) {
        await new Promise(r => setTimeout(r, 100));
        attempts++;
    }
    
    if (typeof window.ImageKit === 'undefined') {
        throw new Error('ImageKit SDK not loaded');
    }
    
    // Use window.ImageKit (the SDK constructor) - NOT overwritten
    imagekitInstance = new window.ImageKit({
        publicKey: IK_PUBLIC_KEY,
        urlEndpoint: IK_URL_ENDPOINT
    });
    
    return imagekitInstance;
}

async function uploadImage(file, folder = "gigs") {
    // Step 1: Fetch tokens from your Vercel endpoint
    const authResponse = await fetch(IK_AUTH_ENDPOINT);
    const auth = await authResponse.json();
    
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${Date.now()}-${cleanName}`;
    
    const imagekit = await getImageKit();
    
    return new Promise((resolve, reject) => {
        imagekit.upload({
            file: file,
            fileName: fileName,
            folder: `/gigscourt/${folder}`,
            token: auth.token,        // ← ADD THIS
            signature: auth.signature, // ← ADD THIS
            expire: auth.expire,       // ← ADD THIS
            useUniqueFileName: true,
            responseFields: ['url', 'thumbnailUrl', 'fileId']
        }, function(error, result) {
            if (error) {
                reject(new Error(error.message || 'Upload failed'));
            } else {
                resolve({
                    url: result.url,
                    thumbnail: result.thumbnailUrl || result.url,
                    fileId: result.fileId
                });
            }
        });
    });
}

function getOptimizedImageUrl(originalUrl, width = 500, height = 500) {
    if (!originalUrl) return generateBlurHash();
    if (originalUrl.includes(IK_URL_ENDPOINT)) {
        const separator = originalUrl.includes('?') ? '&' : '?';
        return `${originalUrl}${separator}tr=w-${width},h-${height},fo-auto,q-60`;
    }
    return originalUrl;
}

function generateBlurHash() {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cfilter id='b'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23b)' fill='%23d35400' opacity='0.3'/%3E%3C/svg%3E";
}

async function uploadMultipleImages(files, folder = "gigs") {
    return Promise.all(files.map(file => uploadImage(file, folder)));
}

async function deleteImage(fileId) {
    console.warn('Delete requires server-side');
    return false;
}

function createLazyImage(originalUrl, alt = "", className = "") {
    const blurHash = generateBlurHash();
    const optimizedUrl = getOptimizedImageUrl(originalUrl, 500, 500);
    const img = document.createElement('img');
    img.src = blurHash;
    img.dataset.src = optimizedUrl;
    img.alt = alt;
    img.className = `${className} lazy-image`;
    img.style.transition = 'filter 0.3s ease';
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                entry.target.src = entry.target.dataset.src;
                entry.target.style.filter = 'blur(0px)';
                observer.unobserve(entry.target);
            }
        });
    });
    observer.observe(img);
    return img;
}

function updateAllImagesToOptimized() {
    document.querySelectorAll('img:not(.optimized)').forEach(img => {
        if (img.src && !img.src.includes('blur')) {
            img.src = getOptimizedImageUrl(img.src);
            img.classList.add('optimized');
        }
    });
}

// EXPORT AS ImageKitService - NO COLLISION with window.ImageKit
window.ImageKitService = {
    uploadImage,
    uploadMultipleImages,
    getOptimizedImageUrl,
    createLazyImage,
    deleteImage,
    generateBlurHash,
    updateAllImagesToOptimized
};
