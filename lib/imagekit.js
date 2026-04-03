// ========================================
// GigsCourt ImageKit Integration
// Using Official SDK + Vercel Authentication Endpoint
// ========================================

// These are safe to expose (public key only)
const IMAGEKIT_PUBLIC_KEY = "public_hwM9hldZI+DqFY/pncPQCA5VRWo=";
const IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/Theprimestar";

// Global SDK instance (initialized when needed)
let imagekitInstance = null;

function getImageKitInstance() {
    if (imagekitInstance) return imagekitInstance;
    
    if (typeof ImageKit === "undefined") {
        console.error("ImageKit SDK not loaded");
        return null;
    }
    
    imagekitInstance = new ImageKit({
        publicKey: IMAGEKIT_PUBLIC_KEY,
        urlEndpoint: IMAGEKIT_URL_ENDPOINT,
        authenticationEndpoint: "/api/imagekit-auth"
    });
    
    return imagekitInstance;
}

// ===== Upload Image using Official SDK =====
async function uploadImage(file, folder = "gigs") {
    const instance = getImageKitInstance();
    if (!instance) {
        throw new Error("ImageKit SDK not loaded");
    }
    
    // Sanitize filename
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${Date.now()}-${cleanName}`;
    
    console.log(`Uploading to folder: /gigscourt/${folder}`);
    
    return new Promise((resolve, reject) => {
        instance.upload({
            file: file,
            fileName: fileName,
            folder: `/gigscourt/${folder}`,
            useUniqueFileName: true,
            responseFields: ["url", "thumbnailUrl", "fileId"]
        }, (error, response) => {
            if (error) {
                console.error("Upload error:", error);
                reject(new Error(error.message || "Upload failed"));
            } else {
                console.log("Upload success:", response.url);
                resolve({
                    url: response.url,
                    thumbnail: response.thumbnailUrl || response.url,
                    fileId: response.fileId
                });
            }
        });
    });
}

// ===== Helper Functions (no changes needed) =====
function generateBlurHash() {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cfilter id='b'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23b)' fill='%23d35400' opacity='0.3'/%3E%3C/svg%3E";
}

function getOptimizedImageUrl(originalUrl, width = 500, height = 500) {
    if (!originalUrl) return generateBlurHash();
    if (originalUrl.includes(IMAGEKIT_URL_ENDPOINT)) {
        const separator = originalUrl.includes('?') ? '&' : '?';
        return `${originalUrl}${separator}tr=w-${width},h-${height},fo-auto,q-60`;
    }
    return originalUrl;
}

async function uploadMultipleImages(files, folder = "gigs") {
    const uploadPromises = files.map(file => uploadImage(file, folder));
    return Promise.all(uploadPromises);
}

async function deleteImage(fileId) {
    // Note: Delete requires private key - implement via Vercel function if needed
    console.warn("Delete not implemented in client SDK");
    return true;
}

function createLazyImage(originalUrl, alt = "", className = "") {
    const blurHash = generateBlurHash();
    const optimizedUrl = getOptimizedImageUrl(originalUrl, 500, 500);
    const img = document.createElement("img");
    img.src = blurHash;
    img.dataset.src = optimizedUrl;
    img.alt = alt;
    img.className = `${className} lazy-image`;
    img.style.transition = "filter 0.3s ease";
    
    const observer = new IntersectionObserver((entries) => {
        entries.forEach(entry => {
            if (entry.isIntersecting) {
                const lazyImg = entry.target;
                lazyImg.src = lazyImg.dataset.src;
                lazyImg.style.filter = "blur(0px)";
                observer.unobserve(lazyImg);
            }
        });
    });
    observer.observe(img);
    return img;
}

function updateAllImagesToOptimized() {
    const images = document.querySelectorAll("img:not(.optimized)");
    images.forEach(img => {
        if (img.src && !img.src.includes("blur")) {
            const optimized = getOptimizedImageUrl(img.src);
            img.src = optimized;
            img.classList.add("optimized");
        }
    });
}

// Export to global
window.ImageKit = {
    publicKey: IMAGEKIT_PUBLIC_KEY,
    urlEndpoint: IMAGEKIT_URL_ENDPOINT,
    getOptimizedImageUrl,
    uploadImage,
    uploadMultipleImages,
    deleteImage,
    createLazyImage,
    generateBlurHash,
    updateAllImagesToOptimized
};
