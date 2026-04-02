// ========================================
// GigsCourt Search Page
// Map-First + Radius Slider + List/Map Toggle
// ========================================

const SearchPage = (function() {
    
    let map = null;
    let markers = [];
    let currentView = "map"; // map or list
    let currentRadius = 10; // km
    let currentLocation = null;
    let currentResults = [];
    let radiusCircle = null;
    
    // Categories
    const categories = ["Barber", "Tailor", "Makeup", "Photography", "Cleaning", "All"];
    
    // ===== Render Main Search Page =====
    function render() {
        const container = document.getElementById("page-content");
        if (!container) return "";
        
        const html = `
            <div class="search-container" style="height: 100vh; display: flex; flex-direction: column;">
                <!-- Glass Search Bar -->
                <div style="padding: 16px; position: sticky; top: 0; z-index: 100; background: var(--bg-primary);">
                    <div class="glass-search" style="display: flex; align-items: center; gap: 12px;">
                        <i class="fas fa-search" style="color: var(--text-secondary);"></i>
                        <input type="text" id="search-input" placeholder="Search for services..." style="
                            background: transparent;
                            border: none;
                            flex: 1;
                            outline: none;
                            color: var(--text-primary);
                            font-size: 16px;
                        ">
                    </div>
                    
                    <!-- Quick Category Pills -->
                    <div id="category-pills" style="display: flex; gap: 10px; overflow-x: auto; margin-top: 12px; padding-bottom: 4px;"></div>
                    
                    <!-- Radius Slider -->
                    <div style="margin-top: 12px;">
                        <div style="display: flex; justify-content: space-between; font-size: 12px; color: var(--text-secondary);">
                            <span>📍 1km</span>
                            <span>Radius: <span id="radius-value">${currentRadius}</span>km</span>
                            <span>30km</span>
                        </div>
                        <input type="range" id="radius-slider" min="1" max="30" value="${currentRadius}" step="1" style="
                            width: 100%;
                            margin-top: 4px;
                            accent-color: var(--accent-burnt-orange);
                        ">
                    </div>
                    
                    <!-- Toggle FAB (Modern Red) -->
                    <button id="toggle-view-btn" style="
                        position: absolute;
                        right: 16px;
                        bottom: -20px;
                        background: var(--accent-modern-red);
                        width: 48px;
                        height: 48px;
                        border-radius: 50%;
                        border: none;
                        box-shadow: 0 4px 12px var(--accent-modern-red-glow);
                        cursor: pointer;
                        z-index: 200;
                    ">
                        <i class="fas fa-list" style="color: white; font-size: 20px;"></i>
                    </button>
                </div>
                
                <!-- Map View -->
                <div id="map-view" style="flex: 1; width: 100%;"></div>
                
                <!-- List View (hidden by default) -->
                <div id="list-view" style="flex: 1; overflow-y: auto; display: none; padding-bottom: 80px;"></div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Initialize components
        initCategories();
        initRadiusSlider();
        initToggleButton();
        initSearchInput();
        initMap();
        
        return html;
    }
    
    // ===== Initialize Category Pills =====
    function initCategories() {
        const container = document.getElementById("category-pills");
        if (!container) return;
        
        categories.forEach(cat => {
            const pill = document.createElement("div");
            pill.textContent = cat;
            pill.style.cssText = `
                padding: 8px 16px;
                background: var(--bg-glass);
                backdrop-filter: blur(10px);
                border-radius: 40px;
                font-size: 14px;
                font-weight: 500;
                white-space: nowrap;
                cursor: pointer;
                transition: all 0.2s ease;
                color: var(--text-primary);
            `;
            pill.addEventListener("click", () => {
                // Update active style
                document.querySelectorAll("#category-pills div").forEach(p => {
                    p.style.background = "var(--bg-glass)";
                    p.style.color = "var(--text-primary)";
                });
                pill.style.background = "var(--accent-burnt-orange)";
                pill.style.color = "white";
                
                // Filter by category
                performSearch(currentLocation, currentRadius, cat === "All" ? null : cat);
            });
            container.appendChild(pill);
        });
        
        // Set first pill as active
        if (container.firstChild) {
            container.firstChild.style.background = "var(--accent-burnt-orange)";
            container.firstChild.style.color = "white";
        }
    }
    
    // ===== Initialize Radius Slider =====
    function initRadiusSlider() {
        const slider = document.getElementById("radius-slider");
        const valueDisplay = document.getElementById("radius-value");
        if (!slider) return;
        
        slider.addEventListener("input", (e) => {
            currentRadius = parseInt(e.target.value);
            if (valueDisplay) valueDisplay.textContent = currentRadius;
            performSearch(currentLocation, currentRadius);
        });
    }
    
    // ===== Initialize Toggle Button (Map/List) =====
    function initToggleButton() {
        const btn = document.getElementById("toggle-view-btn");
        const mapView = document.getElementById("map-view");
        const listView = document.getElementById("list-view");
        if (!btn || !mapView || !listView) return;
        
        btn.addEventListener("click", () => {
            if (currentView === "map") {
                // Switch to list view
                mapView.style.display = "none";
                listView.style.display = "block";
                btn.innerHTML = '<i class="fas fa-map-marker-alt" style="color: white; font-size: 20px;"></i>';
                currentView = "list";
                renderListView();
            } else {
                // Switch to map view
                mapView.style.display = "block";
                listView.style.display = "none";
                btn.innerHTML = '<i class="fas fa-list" style="color: white; font-size: 20px;"></i>';
                currentView = "map";
                if (map) setTimeout(() => map.invalidateSize(), 100);
            }
        });
    }
    
    // ===== Initialize Search Input =====
    function initSearchInput() {
        const input = document.getElementById("search-input");
        if (!input) return;
        
        let debounceTimer;
        input.addEventListener("input", (e) => {
            clearTimeout(debounceTimer);
            debounceTimer = setTimeout(() => {
                performSearch(currentLocation, currentRadius, null, e.target.value);
            }, 500);
        });
    }
    
    // ===== Initialize Leaflet Map =====
    function initMap() {
        // Default location (Lagos, Nigeria)
        const defaultLat = 6.5244;
        const defaultLng = 3.3792;
        
        map = L.map("map-view").setView([defaultLat, defaultLng], 12);
        
        // Dark/light theme based on system preference
        const isDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
        const tileUrl = isDark 
            ? "https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png"
            : "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png";
        
        L.tileLayer(tileUrl, {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        }).addTo(map);
        
        // Get user location
        navigator.geolocation.getCurrentPosition(
            (position) => {
                currentLocation = {
                    lat: position.coords.latitude,
                    lng: position.coords.longitude
                };
                map.setView([currentLocation.lat, currentLocation.lng], 13);
                
                // Add user marker
                L.marker([currentLocation.lat, currentLocation.lng], {
                    icon: L.divIcon({
                        html: '<div style="background: var(--accent-modern-red); width: 12px; height: 12px; border-radius: 50%; border: 2px solid white;"></div>',
                        iconSize: [12, 12]
                    })
                }).addTo(map).bindPopup("You are here");
                
                performSearch(currentLocation, currentRadius);
            },
            (error) => {
                console.log("Location denied, using default");
                performSearch({ lat: defaultLat, lng: defaultLng }, currentRadius);
            }
        );
        
        // Redraw circle when map moves
        map.on("moveend", () => {
            const center = map.getCenter();
            if (currentLocation && (center.lat !== currentLocation.lat || center.lng !== currentLocation.lng)) {
                // User moved map, search new area
                performSearch({ lat: center.lat, lng: center.lng }, currentRadius);
            }
        });
    }
    
    // ===== Perform Search =====
    async function performSearch(location, radius, category = null, query = "") {
        if (!location) return;
        
        // Update radius circle on map
        if (radiusCircle) map.removeLayer(radiusCircle);
        radiusCircle = L.circle([location.lat, location.lng], {
            radius: radius * 1000,
            color: "#d35400",
            weight: 1,
            fillColor: "#d35400",
            fillOpacity: 0.1
        }).addTo(map);
        
        // Fetch nearby profiles using geohash
        try {
            const profiles = await window.SupabaseAPI.getNearbyProfiles(location.lat, location.lng, radius);
            
            // Filter by category and search query
            let filtered = profiles || [];
            
            // Fetch gigs for each profile (simplified - in production, join tables)
            currentResults = filtered;
            
            // Update map markers
            updateMapMarkers(filtered, location);
            
            // Update list view if active
            if (currentView === "list") {
                renderListView();
            }
            
        } catch (error) {
            console.error("Search error:", error);
        }
    }
    
    // ===== Update Map Markers =====
    function updateMapMarkers(profiles, centerLocation) {
        // Clear existing markers
        markers.forEach(marker => map.removeLayer(marker));
        markers = [];
        
        profiles.forEach(profile => {
            if (profile.latitude && profile.longitude) {
                // Decode geohash to get coordinates if needed
                const lat = profile.latitude;
                const lng = profile.longitude;
                
                const marker = L.marker([lat, lng]).addTo(map);
                
                // Calculate distance
                const distance = calculateDistance(
                    centerLocation.lat, centerLocation.lng,
                    lat, lng
                );
                
                marker.bindPopup(`
                    <b>${profile.full_name || profile.username}</b><br>
                    📍 ${formatDistance(distance)} away<br>
                    <button onclick="window.Navigation?.navigateTo('profile_view', {userId: '${profile.id}'}, true)" style="
                        background: #d35400;
                        color: white;
                        border: none;
                        padding: 4px 12px;
                        border-radius: 20px;
                        margin-top: 8px;
                        cursor: pointer;
                    ">View Profile</button>
                `);
                
                markers.push(marker);
            }
        });
    }
    
    // ===== Render List View =====
    function renderListView() {
        const container = document.getElementById("list-view");
        if (!container) return;
        
        if (!currentResults || currentResults.length === 0) {
            container.innerHTML = `<div class="loading">No results found nearby</div>`;
            return;
        }
        
        if (window.Card && window.Card.renderCards) {
            // Convert profiles to gig-like format for card display
            const gigs = currentResults.map(profile => ({
                id: profile.id,
                title: profile.full_name || profile.username,
                category: profile.skills?.[0] || "Service Provider",
                description: profile.bio || "Professional service provider",
                user_id: profile.id,
                images: profile.avatar_url ? [profile.avatar_url] : [],
                is_active: true,
                distance: profile.distance || "Near you"
            }));
            window.Card.renderCards(gigs, container, true);
        } else {
            container.innerHTML = `<div class="loading">Loading cards...</div>`;
        }
    }
    
    // ===== Helper Functions =====
    function calculateDistance(lat1, lon1, lat2, lon2) {
        const R = 6371;
        const dLat = (lat2 - lat1) * Math.PI / 180;
        const dLon = (lon2 - lon1) * Math.PI / 180;
        const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                  Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) *
                  Math.sin(dLon/2) * Math.sin(dLon/2);
        const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
        return R * c;
    }
    
    function formatDistance(dist) {
        if (dist < 1) return `${Math.round(dist * 1000)}m`;
        return `${dist.toFixed(1)}km`;
    }
    
    // ===== Public API =====
    return {
        render,
        refresh: () => performSearch(currentLocation, currentRadius)
    };
    
})();

// Make global
window.SearchPage = SearchPage;
