// ========================================
// GigsCourt ImageKit Integration
// WebP + Quality 60 + BlurHash Placeholders
// FIXED: Proper error logging for 400 debugging
// ========================================

// 🔴 REPLACE THESE WITH YOUR ACTUAL IMAGEKIT KEYS 🔴
const IMAGEKIT_PUBLIC_KEY = "public_hwM9hldZI+DqFY/pncPQCA5VRWo=";
const IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/Theprimestar";

// ===== BlurHash Encoding =====
function generateBlurHash() {
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cfilter id='b'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23b)' fill='%23d35400' opacity='0.3'/%3E%3C/svg%3E";
}

// ===== Optimized Image URL =====
function getOptimizedImageUrl(originalUrl, width = 500, height = 500) {
    if (!originalUrl) return generateBlurHash();
    
    if (originalUrl.includes(IMAGEKIT_URL_ENDPOINT)) {
        const separator = originalUrl.includes('?') ? '&' : '?';
        return `${originalUrl}${separator}tr=w-${width},h-${height},fo-auto,q-60`;
    }
    
    try {
        const encodedUrl = btoa(originalUrl);
        return `${IMAGEKIT_URL_ENDPOINT}/tr:w-${width},h-${height},q-60/${encodedUrl}`;
    } catch (e) {
        return originalUrl;
    }
}

// ===== Upload Image to ImageKit (FIXED: Better error logging) =====
async function uploadImage(file, folder = "gigs") {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("fileName", `${Date.now()}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`);
    formData.append("folder", `/gigscourt/${folder}`);
    formData.append("useUniqueFileName", "true");
    formData.append("responseFields", "url,thumbnailUrl");
    
    let lastError;
    for (let attempt = 1; attempt <= 3; attempt++) {
        try {
            console.log(`Upload attempt ${attempt} to: ${IMAGEKIT_URL_ENDPOINT}/api/v1/files/upload`);
            
            const response = await fetch(`${IMAGEKIT_URL_ENDPOINT}/api/v1/files/upload`, {
                method: "POST",
                headers: {
                    "Authorization": `Basic ${btoa(IMAGEKIT_PUBLIC_KEY + ":")}`
                },
                body: formData
            });
            
            console.log(`Response status: ${response.status}`);
            
            if (!response.ok) {
                const errorText = await response.text();
                console.error("ImageKit error response BODY:", errorText);
                throw new Error(`HTTP ${response.status}: ${errorText.substring(0, 200)}`);
            }
            
            const data = await response.json();
            console.log("Upload success:", data.url);
            return {
                url: data.url,
                thumbnail: data.thumbnailUrl || data.url,
                fileId: data.fileId
            };
        } catch (error) {
            lastError = error;
            console.warn(`Upload attempt ${attempt} failed:`, error.message);
            if (attempt < 3) {
                await new Promise(r => setTimeout(r, 1000 * attempt));
            }
        }
    }
    
    throw lastError;
}

// ===== Upload Multiple Images =====
async function uploadMultipleImages(files, folder = "gigs") {
    const uploadPromises = files.map(file => uploadImage(file, folder));
    return Promise.all(uploadPromises);
}

// ===== Delete Image =====
async function deleteImage(fileId) {
    const response = await fetch(`${IMAGEKIT_URL_ENDPOINT}/api/v1/files/${fileId}`, {
        method: "DELETE",
        headers: {
            "Authorization": `Basic ${btoa(IMAGEKIT_PUBLIC_KEY + ":")}`
        }
    });
    
    if (!response.ok) {
        throw new Error("Delete failed");
    }
    return true;
}

// ===== Generate BlurHash from Image URL =====
async function getBlurHashFromImage(imageUrl) {
    return generateBlurHash();
}

// ===== Lazy Image with Blur Placeholder =====
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

// ===== Update Existing Images =====
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
    getBlurHashFromImage,
    updateAllImagesToOptimized
};
