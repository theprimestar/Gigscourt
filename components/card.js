// ========================================
// GigsCourt Portfolio Card Component
// Full-width card with active status + distance pill
// ========================================

const Card = (function() {
    
    // ===== Create a Single Card =====
    function createCard(gig, showDistance = true) {
        const card = document.createElement("div");
        card.className = "card";
        card.dataset.gigId = gig.id;
        card.dataset.userId = gig.user_id;
        
        // Get first image or placeholder
        const imageUrl = gig.images && gig.images[0] 
            ? gig.images[0] 
            : "https://placehold.co/600x400/faf7f2/d35400?text=No+Image";
        
        // Optimize image via ImageKit if available
        const optimizedImage = window.ImageKit 
            ? window.ImageKit.getOptimizedImageUrl(imageUrl, 500, 400)
            : imageUrl;
        
        // Active status (random for demo - will be real from DB)
        const isActive = gig.is_active !== false;
        
        // Distance (will be calculated from user location)
        const distanceText = gig.distance || "2.3 km";
        
        card.innerHTML = `
            <div class="card-image-container">
                <img class="card-image" src="${optimizedImage}" alt="${gig.title}" loading="lazy">
            </div>
            <div class="card-content">
                <div class="card-title">${escapeHtml(gig.title)}</div>
                <div class="card-category">${escapeHtml(gig.category || "Service")}</div>
                <div class="card-description">${escapeHtml(gig.description || "").substring(0, 80)}${gig.description?.length > 80 ? "..." : ""}</div>
                <div class="card-footer">
                    <div class="active-badge">
                        <div class="active-ring"></div>
                        <span>${isActive ? "Active" : "Offline"}</span>
                    </div>
                    ${showDistance ? `<div class="distance-pill" data-distance="${gig.distance || 2.3}">📍 ${distanceText}</div>` : ""}
                </div>
            </div>
        `;
        
        // Add click handler for distance pill
        const distancePill = card.querySelector(".distance-pill");
        if (distancePill) {
            distancePill.addEventListener("click", (e) => {
                e.stopPropagation();
                showLocationSheet(gig);
            });
        }
        
        // Add click handler for card (view profile)
        card.addEventListener("click", () => {
            viewUserProfile(gig.user_id);
        });
        
        return card;
    }
    
    // ===== Show Location Bottom Sheet =====
    function showLocationSheet(gig) {
        const modalContainer = document.getElementById("modal-container");
        if (!modalContainer) return;
        
        const lat = gig.latitude || 6.5244;
        const lng = gig.longitude || 3.3792;
        
        const modal = document.createElement("div");
        modal.className = "modal-overlay";
        modal.innerHTML = `
            <div class="bottom-sheet">
                <div style="text-align: center; margin-bottom: 16px;">
                    <i class="fas fa-map-marker-alt" style="font-size: 32px; color: var(--accent-modern-red);"></i>
                    <h3 style="margin-top: 8px;">Location</h3>
                    <p style="color: var(--text-secondary);">${escapeHtml(gig.address || "Address not specified")}</p>
                </div>
                <div id="route-map" style="height: 200px; border-radius: 16px; margin: 16px 0; background: #333;"></div>
                <button class="btn-modern-red" id="close-location-sheet" style="width: 100%; margin-top: 16px;">
                    Close
                </button>
            </div>
        `;
        
        modalContainer.appendChild(modal);
        
        // Initialize map
        setTimeout(() => {
            const mapDiv = document.getElementById("route-map");
            if (mapDiv && window.L) {
                const map = window.L.map(mapDiv).setView([lat, lng], 14);
                window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
                }).addTo(map);
                window.L.marker([lat, lng]).addTo(map);
            }
        }, 100);
        
        document.getElementById("close-location-sheet")?.addEventListener("click", () => {
            modal.remove();
        });
    }
    
    // ===== View User Profile =====
    function viewUserProfile(userId) {
        if (window.Navigation) {
            window.Navigation.navigateTo("profile_view", { userId: userId }, true);
        } else {
            window.location.hash = `p/${userId}`;
        }
    }
    
    // ===== Render Multiple Cards =====
    function renderCards(gigs, container, showDistance = true) {
        if (!container) return;
        
        container.innerHTML = "";
        
        if (!gigs || gigs.length === 0) {
            container.innerHTML = `<div class="loading">No gigs found nearby</div>`;
            return;
        }
        
        gigs.forEach(gig => {
            const card = createCard(gig, showDistance);
            container.appendChild(card);
        });
    }
    
    // ===== Helper: Escape HTML =====
    function escapeHtml(str) {
        if (!str) return "";
        return str
            .replace(/&/g, "&amp;")
            .replace(/</g, "&lt;")
            .replace(/>/g, "&gt;")
            .replace(/"/g, "&quot;")
            .replace(/'/g, "&#39;");
    }
    
    // Public API
    return {
        createCard,
        renderCards,
        viewUserProfile
    };
    
})();

// Make global
window.Card = Card;
