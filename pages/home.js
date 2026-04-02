// ========================================
// GigsCourt Home Page
// Discovery Hub + Infinite Scroll + Pull-to-Refresh
// ========================================

const HomePage = (function() {
    
    let currentPage = 0;
    let isLoading = false;
    let hasMore = true;
    let allGigs = [];
    let scrollTrigger = null;
    let refreshStartY = 0;
    let isRefreshing = false;
    
    // ===== Render Main Home Page =====
    function render() {
        const container = document.getElementById("page-content");
        if (!container) return "";
        
        const html = `
            <div class="home-container">
                <div class="home-header" style="
                    position: sticky;
                    top: 0;
                    background: var(--bg-primary);
                    padding: 16px;
                    z-index: 10;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <h1 style="font-size: 28px; font-weight: 700; letter-spacing: -0.5px;">
                            Gigs<span style="color: var(--accent-burnt-orange);">Court</span>
                        </h1>
                        <i class="fas fa-sliders-h" style="font-size: 20px; color: var(--text-secondary); cursor: pointer;" id="filter-btn"></i>
                    </div>
                </div>
                
                <div id="gigs-container" style="padding-bottom: 20px;">
                    <div class="loading">Loading gigs near you...</div>
                </div>
                
                <div id="scroll-trigger" class="scroll-trigger"></div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Reset state
        currentPage = 0;
        allGigs = [];
        hasMore = true;
        isLoading = false;
        
        // Load initial gigs
        loadGigs();
        
        // Setup infinite scroll
        setupInfiniteScroll();
        
        // Setup pull-to-refresh
        setupPullToRefresh();
        
        // Setup filter button
        document.getElementById("filter-btn")?.addEventListener("click", showFilterModal);
        
        return html;
    }
    
    // ===== Load Gigs from Database =====
    async function loadGigs(append = true) {
        if (isLoading || !hasMore) return;
        
        isLoading = true;
        updateScrollTrigger("loading...");
        
        try {
            // Get user location
            let userLat = null, userLng = null;
            try {
                const position = await getCurrentPosition();
                userLat = position.latitude;
                userLng = position.longitude;
                
                // Update user's geohash in DB if logged in
                const currentUser = await window.SupabaseAPI?.getCurrentUser();
                if (currentUser && userLat && userLng) {
                    await window.SupabaseAPI.updateGeohash(currentUser.user.id, userLat, userLng);
                }
            } catch (e) {
                console.log("Location not available, using default");
            }
            
            // Fetch gigs using cached SWR pattern
            const cacheKey = `gigs_page_${currentPage}`;
            
            let gigs;
            if (window.Cache && !append) {
                gigs = await window.Cache.swr(cacheKey, async () => {
                    return await window.SupabaseAPI.getGigs({}, currentPage, 10);
                }, 300000); // 5 min cache
            } else {
                gigs = await window.SupabaseAPI.getGigs({}, currentPage, 10);
            }
            
            if (!gigs || gigs.length === 0) {
                hasMore = false;
                updateScrollTrigger("No more gigs");
            } else {
                if (gigs.length < 10) hasMore = false;
                
                // Calculate distances if location available
                if (userLat && userLng) {
                    gigs = gigs.map(gig => {
                        // If gig has location data, calculate distance
                        if (gig.profiles?.latitude && gig.profiles?.longitude) {
                            const distance = calculateDistance(
                                userLat, userLng,
                                gig.profiles.latitude, gig.profiles.longitude
                            );
                            gig.distance = formatDistance(distance);
                        } else {
                            gig.distance = "N/A";
                        }
                        return gig;
                    });
                }
                
                if (append) {
                    allGigs = [...allGigs, ...gigs];
                } else {
                    allGigs = gigs;
                }
                
                renderGigs(allGigs);
                currentPage++;
            }
            
        } catch (error) {
            console.error("Error loading gigs:", error);
            updateScrollTrigger("Error loading. Tap to retry.");
            const trigger = document.getElementById("scroll-trigger");
            if (trigger) {
                trigger.addEventListener("click", () => loadGigs(append), { once: true });
            }
        }
        
        isLoading = false;
    }
    
    // ===== Render Gigs to DOM =====
    function renderGigs(gigs) {
        const container = document.getElementById("gigs-container");
        if (!container) return;
        
        if (gigs.length === 0) {
            container.innerHTML = `<div class="loading">No gigs found nearby. Pull to refresh.</div>`;
            return;
        }
        
        if (window.Card && window.Card.renderCards) {
            window.Card.renderCards(gigs, container, true);
        } else {
            // Fallback rendering
            container.innerHTML = "";
            gigs.forEach(gig => {
                const card = createSimpleCard(gig);
                container.appendChild(card);
            });
        }
    }
    
    // ===== Simple Card Fallback =====
    function createSimpleCard(gig) {
        const div = document.createElement("div");
        div.className = "card";
        div.innerHTML = `
            <div class="card-content">
                <div class="card-title">${gig.title}</div>
                <div class="card-category">${gig.category || "Service"}</div>
                <div class="card-footer">
                    <div class="active-badge"><div class="active-ring"></div><span>Active</span></div>
                    <div class="distance-pill">📍 ${gig.distance || "Near you"}</div>
                </div>
            </div>
        `;
        return div;
    }
    
    // ===== Infinite Scroll Setup =====
    function setupInfiniteScroll() {
        const observer = new IntersectionObserver((entries) => {
            entries.forEach(entry => {
                if (entry.isIntersecting && !isLoading && hasMore) {
                    loadGigs(true);
                }
            });
        }, { threshold: 0.1 });
        
        const trigger = document.getElementById("scroll-trigger");
        if (trigger) observer.observe(trigger);
    }
    
    // ===== Update Scroll Trigger Text =====
    function updateScrollTrigger(text) {
        const trigger = document.getElementById("scroll-trigger");
        if (trigger) trigger.textContent = text;
    }
    
    // ===== Pull-to-Refresh Setup =====
    function setupPullToRefresh() {
        const container = document.querySelector(".home-container");
        if (!container) return;
        
        let touchStartY = 0;
        
        container.addEventListener("touchstart", (e) => {
            if (window.scrollY === 0) {
                touchStartY = e.touches[0].clientY;
            }
        });
        
        container.addEventListener("touchmove", (e) => {
            if (touchStartY > 0 && window.scrollY === 0) {
                const deltaY = e.touches[0].clientY - touchStartY;
                if (deltaY > 60 && !isRefreshing) {
                    triggerRefresh();
                }
            }
        });
        
        container.addEventListener("touchend", () => {
            touchStartY = 0;
        });
    }
    
    // ===== Trigger Refresh with Liquid Animation =====
    async function triggerRefresh() {
        if (isRefreshing) return;
        isRefreshing = true;
        
        // Liquid fill animation on logo
        const logo = document.querySelector(".home-header h1");
        if (logo) {
            logo.classList.add("logo-liquid");
            setTimeout(() => logo.classList.remove("logo-liquid"), 800);
        }
        
        // Haptic tick if supported
        if (navigator.vibrate) {
            navigator.vibrate(50);
        }
        
        // Reset and reload
        currentPage = 0;
        allGigs = [];
        hasMore = true;
        
        // Clear cache for home page
        if (window.Cache) {
            window.Cache.invalidatePattern("gigs_page_");
        }
        
        await loadGigs(false);
        
        isRefreshing = false;
        
        // Show success indicator
        updateScrollTrigger("Updated!");
        setTimeout(() => {
            if (hasMore) updateScrollTrigger("");
            else updateScrollTrigger("No more gigs");
        }, 1000);
    }
    
    // ===== Show Filter Modal =====
    function showFilterModal() {
        if (window.Modal) {
            window.Modal.showBottomSheet("Filter Gigs", `
                <div style="display: flex; flex-direction: column; gap: 12px;">
                    <div class="filter-option" data-category="all" style="padding: 12px; background: var(--bg-primary); border-radius: 12px; cursor: pointer;">All Categories</div>
                    <div class="filter-option" data-category="Barber" style="padding: 12px; background: var(--bg-primary); border-radius: 12px; cursor: pointer;">✂️ Barber</div>
                    <div class="filter-option" data-category="Tailor" style="padding: 12px; background: var(--bg-primary); border-radius: 12px; cursor: pointer;">👔 Tailor</div>
                    <div class="filter-option" data-category="Makeup" style="padding: 12px; background: var(--bg-primary); border-radius: 12px; cursor: pointer;">💄 Makeup Artist</div>
                    <div class="filter-option" data-category="Photography" style="padding: 12px; background: var(--bg-primary); border-radius: 12px; cursor: pointer;">📸 Photographer</div>
                </div>
            `, { showClose: true });
            
            document.querySelectorAll(".filter-option").forEach(opt => {
                opt.addEventListener("click", () => {
                    window.Modal.closeModal();
                    // Apply filter (simplified for now)
                    alert("Filter: " + opt.dataset.category);
                });
            });
        }
    }
    
    // ===== Get User Location =====
    function getCurrentPosition() {
        return new Promise((resolve, reject) => {
            if (!navigator.geolocation) {
                reject(new Error("Geolocation not supported"));
                return;
            }
            navigator.geolocation.getCurrentPosition(
                (position) => resolve({
                    latitude: position.coords.latitude,
                    longitude: position.coords.longitude
                }),
                (error) => reject(error)
            );
        });
    }
    
    // ===== Calculate Distance (Haversine formula) =====
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371; // Earth's radius in km
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    function formatDistance(dist) {
        if (dist < 1) return `${Math.round(dist * 1000)} m`;
        return `${dist.toFixed(1)} km`;
    }
    
    // ===== Public API =====
    return {
        render,
        refresh: () => triggerRefresh()
    };
    
})();

// Make global
window.HomePage = HomePage;
