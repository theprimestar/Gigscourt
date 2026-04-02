// ========================================
// GigsCourt Profile Page
// Single Identity + Wallet + Portfolio + Admin Trigger
// ========================================

const ProfilePage = (function() {
    
    let currentViewingUser = null; // null means viewing own profile
    let userGigs = [];
    let longPressTimer = null;
    
    // ===== Render Main Profile Page =====
    function render(params = {}) {
        const container = document.getElementById("page-content");
        if (!container) return "";
        
        // Check if viewing another user's profile
        const userId = params.userId;
        if (userId && userId !== getCurrentUserId()) {
            return renderUserProfile(userId);
        }
        
        // Render own profile
        return renderOwnProfile();
    }
    
    function renderOwnProfile() {
        const container = document.getElementById("page-content");
        if (!container) return "";
        
        const html = `
            <div class="profile-container" style="padding: 16px; padding-bottom: 100px;">
                <!-- Header with long-press trigger for admin -->
                <div class="profile-header" style="text-align: center; margin-top: 20px;" id="admin-trigger">
                    <div style="width: 100px; height: 100px; border-radius: 50%; background: var(--accent-burnt-orange); margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 48px; color: white;">
                        <i class="fas fa-user"></i>
                    </div>
                    <h2 id="display-name" style="margin-top: 12px; font-size: 24px;">Loading...</h2>
                    <p id="user-bio" style="color: var(--text-secondary); margin-top: 4px;">Loading...</p>
                    <p id="user-location" style="color: var(--text-secondary); font-size: 14px;"><i class="fas fa-map-marker-alt"></i> <span>Loading...</span></p>
                </div>
                
                <!-- Wallet Display -->
                <div class="wallet-section" style="
                    background: linear-gradient(135deg, var(--accent-burnt-orange), var(--accent-modern-red));
                    border-radius: 20px;
                    padding: 20px;
                    margin: 20px 0;
                    color: white;
                ">
                    <div style="display: flex; justify-content: space-between; align-items: center;">
                        <div>
                            <div style="font-size: 14px; opacity: 0.9;">My Credits</div>
                            <div style="font-size: 36px; font-weight: 700;" id="wallet-credits">0</div>
                        </div>
                        <button id="top-up-btn" style="
                            background: rgba(255,255,255,0.2);
                            border: none;
                            padding: 10px 20px;
                            border-radius: 40px;
                            color: white;
                            font-weight: 600;
                            cursor: pointer;
                        ">Top Up</button>
                    </div>
                </div>
                
                <!-- Action Buttons -->
                <div style="display: flex; gap: 12px; margin-bottom: 24px;">
                    <button id="register-gig-btn" class="btn-burnt-orange" style="flex: 1;">📋 Register Gig</button>
                    <button id="edit-profile-btn" class="btn-modern-red" style="flex: 1;">✏️ Edit Profile</button>
                </div>
                
                <!-- Portfolio Section -->
                <div style="margin-top: 8px;">
                    <h3 style="margin-bottom: 12px;">My Portfolio</h3>
                    <div id="portfolio-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;"></div>
                </div>
                
                <!-- Stats Section -->
                <div style="margin-top: 24px; display: flex; justify-content: space-around; padding: 16px; background: var(--bg-secondary); border-radius: 20px;">
                    <div style="text-align: center;">
                        <div style="font-size: 24px; font-weight: 700;" id="rating-count">0</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">Ratings</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 24px; font-weight: 700;" id="avg-rating">0.0</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">★ Average</div>
                    </div>
                    <div style="text-align: center;">
                        <div style="font-size: 24px; font-weight: 700;" id="gigs-count">0</div>
                        <div style="font-size: 12px; color: var(--text-secondary);">Gigs</div>
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Load user data
        loadOwnProfile();
        loadUserGigs(getCurrentUserId());
        loadUserRatings(getCurrentUserId());
        
        // Setup event listeners
        setupAdminLongPress();
        document.getElementById("top-up-btn")?.addEventListener("click", () => {
            showTopUpModal();
        });
        document.getElementById("register-gig-btn")?.addEventListener("click", () => {
            if (window.Modal) {
                window.Modal.showRegisterGigModal(() => {
                    loadUserGigs(getCurrentUserId());
                });
            }
        });
        document.getElementById("edit-profile-btn")?.addEventListener("click", showEditProfileModal);
        
        return html;
    }
    
    function renderUserProfile(userId) {
        const container = document.getElementById("page-content");
        if (!container) return "";
        
        container.innerHTML = `
            <div class="profile-container" style="padding: 16px; padding-bottom: 100px;">
                <div class="profile-header" style="text-align: center; margin-top: 20px;">
                    <div style="width: 100px; height: 100px; border-radius: 50%; background: var(--accent-burnt-orange); margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 48px; color: white;">
                        <i class="fas fa-user"></i>
                    </div>
                    <h2 id="visitor-display-name" style="margin-top: 12px; font-size: 24px;">Loading...</h2>
                    <p id="visitor-bio" style="color: var(--text-secondary); margin-top: 4px;">Loading...</p>
                </div>
                
                <!-- Visitor Action Buttons -->
                <div style="display: flex; gap: 12px; margin: 20px 0;">
                    <button id="visitor-message-btn" class="btn-burnt-orange" style="flex: 1;">💬 Message</button>
                    <button id="visitor-call-btn" class="btn-modern-red" style="flex: 1;">📞 Call</button>
                </div>
                
                <!-- Portfolio Section -->
                <div style="margin-top: 8px;">
                    <h3 style="margin-bottom: 12px;">Portfolio</h3>
                    <div id="visitor-portfolio-grid" style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;"></div>
                </div>
            </div>
        `;
        
        loadUserProfile(userId);
        loadUserGigs(userId, "visitor-portfolio-grid");
        
        document.getElementById("visitor-message-btn")?.addEventListener("click", () => {
            if (window.MessagesPage && currentViewingUser) {
                window.MessagesPage.openChat(currentViewingUser);
            }
        });
        
        document.getElementById("visitor-call-btn")?.addEventListener("click", () => {
            if (currentViewingUser?.phone) {
                window.location.href = `tel:${currentViewingUser.phone}`;
            } else {
                window.Modal?.showAlert("Call", "User hasn't shared phone number");
            }
        });
        
        return html;
    }
    
    // ===== Load Own Profile =====
    async function loadOwnProfile() {
        try {
            const currentUser = await window.SupabaseAPI.getCurrentUser();
            if (!currentUser) {
                window.Modal?.showAlert("Login Required", "Please log in to view profile");
                return;
            }
            
            const profile = await window.SupabaseAPI.getProfile(currentUser.user.id);
            if (profile) {
                document.getElementById("display-name").textContent = profile.full_name || profile.username || "User";
                document.getElementById("user-bio").textContent = profile.bio || "No bio yet";
                document.getElementById("wallet-credits").textContent = profile.credits || 0;
                const locationSpan = document.querySelector("#user-location span");
                if (locationSpan) locationSpan.textContent = profile.address || "Location not set";
            }
        } catch (error) {
            console.error("Error loading profile:", error);
        }
    }
    
    async function loadUserProfile(userId) {
        try {
            const profile = await window.SupabaseAPI.getProfile(userId);
            currentViewingUser = profile;
            document.getElementById("visitor-display-name").textContent = profile.full_name || profile.username || "User";
            document.getElementById("visitor-bio").textContent = profile.bio || "No bio yet";
        } catch (error) {
            console.error("Error loading user profile:", error);
        }
    }
    
    // ===== Load User Gigs =====
    async function loadUserGigs(userId, containerId = "portfolio-grid") {
        try {
            const gigs = await window.SupabaseAPI.getGigs({ userId: userId });
            userGigs = gigs;
            
            const container = document.getElementById(containerId);
            if (!container) return;
            
            document.getElementById("gigs-count")?.textContent = gigs.length;
            
            if (gigs.length === 0) {
                container.innerHTML = `<div style="grid-column: span 3; text-align: center; color: var(--text-secondary);">No gigs listed yet</div>`;
                return;
            }
            
            container.innerHTML = "";
            gigs.forEach(gig => {
                const imageUrl = gig.images?.[0] || "https://placehold.co/300x300/faf7f2/d35400?text=No+Image";
                const optimizedUrl = window.ImageKit ? window.ImageKit.getOptimizedImageUrl(imageUrl, 300, 300) : imageUrl;
                
                const item = document.createElement("div");
                item.style.cssText = `
                    aspect-ratio: 1;
                    border-radius: 12px;
                    overflow: hidden;
                    cursor: pointer;
                `;
                item.innerHTML = `<img src="${optimizedUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
                item.addEventListener("click", () => {
                    window.Modal?.showBottomSheet(gig.title, `
                        <p>${gig.description || "No description"}</p>
                        <p><strong>Price:</strong> ${gig.price_range || "Negotiable"}</p>
                        <p><strong>Category:</strong> ${gig.category || "Service"}</p>
                    `);
                });
                container.appendChild(item);
            });
            
        } catch (error) {
            console.error("Error loading gigs:", error);
        }
    }
    
    // ===== Load User Ratings =====
    async function loadUserRatings(userId) {
        try {
            const { ratings, average } = await window.SupabaseAPI.getUserRatings(userId);
            document.getElementById("rating-count").textContent = ratings.length;
            document.getElementById("avg-rating").textContent = average.toFixed(1);
        } catch (error) {
            console.error("Error loading ratings:", error);
        }
    }
    
    // ===== Show Top Up Modal =====
    async function showTopUpModal() {
        const currentUser = await window.SupabaseAPI.getCurrentUser();
        if (!currentUser) return;
        
        if (window.Paystack) {
            window.Paystack.showTopUpModal(currentUser.user.email, currentUser.user.id);
        } else {
            window.Modal?.showAlert("Payment", "Paystack not configured");
        }
    }
    
    // ===== Edit Profile Modal =====
    function showEditProfileModal() {
        window.Modal?.showBottomSheet("Edit Profile", `
            <input type="text" id="edit-fullname" placeholder="Full Name" style="width: 100%; padding: 12px; margin-bottom: 12px; border-radius: 12px; border: 1px solid var(--border-glass); background: var(--bg-primary); color: var(--text-primary);">
            <textarea id="edit-bio" placeholder="Bio" rows="3" style="width: 100%; padding: 12px; margin-bottom: 12px; border-radius: 12px; border: 1px solid var(--border-glass); background: var(--bg-primary); color: var(--text-primary);"></textarea>
            <input type="text" id="edit-address" placeholder="Address" style="width: 100%; padding: 12px; margin-bottom: 20px; border-radius: 12px; border: 1px solid var(--border-glass); background: var(--bg-primary); color: var(--text-primary);">
            <button id="save-profile-btn" class="btn-burnt-orange" style="width: 100%;">Save Changes</button>
        `, { showClose: true });
        
        document.getElementById("save-profile-btn")?.addEventListener("click", async () => {
            const fullname = document.getElementById("edit-fullname")?.value;
            const bio = document.getElementById("edit-bio")?.value;
            const address = document.getElementById("edit-address")?.value;
            
            const currentUser = await window.SupabaseAPI.getCurrentUser();
            if (currentUser) {
                await window.SupabaseAPI.updateProfile(currentUser.user.id, {
                    full_name: fullname,
                    bio: bio,
                    address: address
                });
                window.Modal?.closeModal();
                loadOwnProfile();
                window.Modal?.showAlert("Success", "Profile updated!");
            }
        });
    }
    
    // ===== Admin Long Press Trigger =====
    function setupAdminLongPress() {
        const trigger = document.getElementById("admin-trigger");
        if (!trigger) return;
        
        let pressTimer;
        
        trigger.addEventListener("touchstart", (e) => {
            pressTimer = setTimeout(async () => {
                // Long press detected
                const currentUser = await window.SupabaseAPI.getCurrentUser();
                if (currentUser) {
                    const isAdmin = await window.SupabaseAPI.checkIsAdmin(currentUser.user.id);
                    if (isAdmin) {
                        if (window.Admin && window.Admin.render) {
                            window.Admin.render();
                        } else if (window.Navigation) {
                            window.Navigation.navigateTo("admin", {}, true);
                        }
                    }
                }
            }, 800);
        });
        
        trigger.addEventListener("touchend", () => {
            clearTimeout(pressTimer);
        });
        
        trigger.addEventListener("touchmove", () => {
            clearTimeout(pressTimer);
        });
    }
    
    function getCurrentUserId() {
        return window.SupabaseAPI?.getCurrentUser()?.then(user => user?.user?.id) || null;
    }
    
    // ===== Public API =====
    return {
        render,
        refresh: () => loadOwnProfile()
    };
    
})();

// Make global
window.ProfilePage = ProfilePage;
