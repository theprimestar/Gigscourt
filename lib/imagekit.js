// ========================================
// GigsCourt ImageKit Integration
// WebP + Quality 60 + BlurHash Placeholders
// ========================================

// 🔴 REPLACE THESE WITH YOUR ACTUAL IMAGEKIT KEYS 🔴
// Go to: ImageKit Dashboard → Developer Options
const IMAGEKIT_PUBLIC_KEY = "public_hwM9hldZI+DqFY/pncPQCA5VRWo=";
const IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/Theprimestar/";
// 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴

// ===== BlurHash Encoding (Simple version for placeholders) =====
function generateBlurHash() {
    // Returns a consistent blur placeholder data URL
    return "data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Cfilter id='b'%3E%3CfeGaussianBlur stdDeviation='20'/%3E%3C/filter%3E%3Crect width='100' height='100' filter='url(%23b)' fill='%23d35400' opacity='0.3'/%3E%3C/svg%3E";
}

// ===== Optimized Image URL (WebP, Quality 60) =====
function getOptimizedImageUrl(originalUrl, width = 500, height = 500) {
    if (!originalUrl) return generateBlurHash();
    
    // If already an ImageKit URL, add transformations
    if (originalUrl.includes(IMAGEKIT_URL_ENDPOINT)) {
        // Add transformation parameters
        const separator = originalUrl.includes('?') ? '&' : '?';
        return `${originalUrl}${separator}tr=w-${width},h-${height},fo-auto,q-60`;
    }
    
    // For external images, proxy through ImageKit
    const encodedUrl = btoa(originalUrl);
    return `${IMAGEKIT_URL_ENDPOINT}/tr:w-${width},h-${height},q-60/${encodedUrl}`;
}

// ===== Upload Image to ImageKit =====
async function uploadImage(file, folder = "gigs") {
    const formData = new FormData();
    formData.append("file", file);
    formData.append("fileName", `${Date.now()}-${file.name}`);
    formData.append("folder", `/gigscourt/${folder}`);
    formData.append("useUniqueFileName", "true");
    formData.append("responseFields", "url,thumbnailUrl");
    
    // ImageKit upload API requires authentication
    const response = await fetch(`${IMAGEKIT_URL_ENDPOINT}/api/v1/files/upload`, {
        method: "POST",
        headers: {
            "Authorization": `Basic ${btoa(IMAGEKIT_PUBLIC_KEY + ":")}`
        },
        body: formData
    });
    
    if (!response.ok) {
        const error = await response.json();
        throw new Error(error.message || "Upload failed");
    }
    
    const data = await response.json();
    return {
        url: data.url,
        thumbnail: data.thumbnailUrl || data.url,
        fileId: data.fileId
    };
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

// ===== Generate BlurHash from Image URL (async) =====
async function getBlurHashFromImage(imageUrl) {
    // For production, you'd use a library like waifu or blurhash
    // This is a simplified version returning a data URL placeholder
    return generateBlurHash();
}

// ===== Render Image with Lazy Loading + Blur Placeholder =====
function createLazyImage(originalUrl, alt = "", className = "") {
    const blurHash = generateBlurHash();
    const optimizedUrl = getOptimizedImageUrl(originalUrl, 500, 500);
    
    const img = document.createElement("img");
    img.src = blurHash;
    img.dataset.src = optimizedUrl;
    img.alt = alt;
    img.className = `${className} lazy-image`;
    img.style.transition = "filter 0.3s ease";
    
    // Intersection Observer for lazy loading
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

// ===== Update Existing Images to WebP Quality 60 =====
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
