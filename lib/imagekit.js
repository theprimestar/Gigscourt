// ========================================
// GigsCourt ImageKit Integration
// Waits for SDK to be ready
// ========================================

const IK_PUBLIC_KEY = "public_hwM9hldZI+DqFY/pncPQCA5VRWo=";
const IK_URL_ENDPOINT = "https://ik.imagekit.io/Theprimestar";
const IK_AUTH_ENDPOINT = "/api/imagekit-auth";

let imagekitInstance = null;
let waitForSDKResolve = null;
let waitForSDKReady = new Promise((resolve) => {
    waitForSDKResolve = resolve;
});

// Wait for SDK to be available (handles both sync and async loading)
function waitForImageKitSDK() {
    if (typeof ImageKit !== 'undefined') {
        waitForSDKResolve();
        return Promise.resolve();
    }
    
    // Check every 100ms for up to 5 seconds
    let attempts = 0;
    const interval = setInterval(() => {
        attempts++;
        if (typeof ImageKit !== 'undefined') {
            clearInterval(interval);
            waitForSDKResolve();
        } else if (attempts >= 50) { // 5 seconds timeout
            clearInterval(interval);
            console.error('ImageKit SDK failed to load after 5 seconds');
            waitForSDKResolve(); // Resolve anyway to show error
        }
    }, 100);
    
    return waitForSDKReady;
}

async function getImageKit() {
    if (imagekitInstance) return imagekitInstance;
    
    await waitForImageKitSDK();
    
    if (typeof ImageKit === 'undefined') {
        throw new Error('ImageKit SDK not available after waiting');
    }
    
    try {
        imagekitInstance = new ImageKit({
            publicKey: IK_PUBLIC_KEY,
            urlEndpoint: IK_URL_ENDPOINT,
            authenticationEndpoint: IK_AUTH_ENDPOINT
        });
        console.log('ImageKit SDK initialized');
    } catch (error) {
        console.error('Failed to initialize ImageKit:', error);
        throw error;
    }
    
    return imagekitInstance;
}

async function uploadImage(file, folder = "gigs") {
    const imagekit = await getImageKit();
    
    const cleanName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const fileName = `${Date.now()}-${cleanName}`;
    
    console.log(`Uploading to folder: /gigscourt/${folder}`);
    
    return new Promise((resolve, reject) => {
        imagekit.upload({
            file: file,
            fileName: fileName,
            folder: `/gigscourt/${folder}`,
            useUniqueFileName: true,
            responseFields: ['url', 'thumbnailUrl', 'fileId']
        }, function(error, result) {
            if (error) {
                console.error('Upload error:', error);
                reject(new Error(error.message || 'Upload failed'));
            } else {
                console.log('Upload success:', result.url);
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
    const promises = files.map(file => uploadImage(file, folder));
    return Promise.all(promises);
}

async function deleteImage(fileId) {
    console.warn('Delete requires server-side implementation');
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
                const target = entry.target;
                target.src = target.dataset.src;
                target.style.filter = 'blur(0px)';
                observer.unobserve(target);
            }
        });
    });
    
    observer.observe(img);
    return img;
}

function updateAllImagesToOptimized() {
    const images = document.querySelectorAll('img:not(.optimized)');
    images.forEach(img => {
        if (img.src && !img.src.includes('blur')) {
            const optimized = getOptimizedImageUrl(img.src);
            img.src = optimized;
            img.classList.add('optimized');
        }
    });
}

window.ImageKit = {
    uploadImage,
    uploadMultipleImages,
    getOptimizedImageUrl,
    createLazyImage,
    deleteImage,
    generateBlurHash,
    updateAllImagesToOptimized
};

console.log('ImageKit module loaded (with SDK waiting)');
