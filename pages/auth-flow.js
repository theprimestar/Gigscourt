// ========================================
// GigsCourt Auth Flow - 3 Page Signup
// Low-friction onboarding with visibility gating
// ========================================

const AuthFlow = (function() {
    
    let currentStep = 1;
    let selectedServices = [];
    let workspaceLocation = null;
    let workspaceAddressText = "";
    let tempUserId = null; // For OTP flow before account creation
    
    // The 30 services list
    const SERVICES = [
        "Tailoring / fashion design",
        "Barbing (men's haircutting)",
        "Hairdressing (braiding, wigs, styling)",
        "Makeup artistry",
        "Shoe making / cobbling",
        "Phone repairs (hardware/software)",
        "Computer repairs",
        "Electrical installation (wiring, fittings)",
        "Plumbing",
        "Carpentry / furniture making",
        "Masonry / bricklaying",
        "Welding / metal fabrication",
        "Tiling (floor/wall)",
        "POP ceiling installation",
        "Painting (house painting)",
        "Auto mechanic (car repair)",
        "Motorcycle/tricycle repair",
        "Catering (event cooking)",
        "Baking (cakes, pastries)",
        "Event decoration",
        "CCTV installation",
        "Solar panel installation",
        "Generator repair",
        "AC (air conditioner) repair",
        "Aluminum work (windows/doors)",
        "Interior decoration (home setup)",
        "Laundry / dry cleaning service",
        "Upholstery (sofa/seat making & repair)",
        "Printing & branding (flex, banners, T-shirts)",
        "POP screeding / wall finishing"
    ];
    
    let map = null;
    let marker = null;
    
    // ===== Render Main Auth Container =====
    function render() {
        const container = document.getElementById("page-content");
        if (!container) return "";
        
        // Hide tab bar during auth flow
        if (window.TabBar) {
            window.TabBar.hide();
        }
        
        currentStep = 1;
        selectedServices = [];
        workspaceLocation = null;
        
        renderStep1();
    }
    
    function renderStep1() {
        const container = document.getElementById("page-content");
        if (!container) return;
        
        const html = `
            <div class="auth-container" style="min-height: 100vh; background: var(--bg-primary); padding: 24px 16px;">
                <div style="max-width: 500px; margin: 0 auto;">
                    <!-- Progress Indicator -->
                    <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 32px;">
                        <div style="width: 40px; height: 4px; background: var(--accent-burnt-orange); border-radius: 4px;"></div>
                        <div style="width: 40px; height: 4px; background: var(--text-tertiary); border-radius: 4px;"></div>
                        <div style="width: 40px; height: 4px; background: var(--text-tertiary); border-radius: 4px;"></div>
                    </div>
                    
                    <h1 style="font-size: 32px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 8px;">
                        What services do you offer?
                    </h1>
                    <p style="color: var(--text-secondary); margin-bottom: 24px;">
                        Select all that apply. Clients search by service type.
                    </p>
                    
                    <!-- Search Input -->
                    <div class="glass-search" style="margin: 0 0 16px 0; width: 100%;">
                        <i class="fas fa-search" style="color: var(--text-secondary); margin-right: 12px;"></i>
                        <input type="text" id="service-search" placeholder="Search services..." style="background: transparent; border: none; flex: 1; outline: none; color: var(--text-primary);">
                    </div>
                    
                    <!-- Services Chips Grid -->
                    <div id="services-grid" style="display: flex; flex-wrap: wrap; gap: 10px; margin-bottom: 32px; max-height: 50vh; overflow-y: auto; padding: 4px;"></div>
                    
                    <!-- Skip Button -->
                    <button id="skip-step1" class="btn-modern-red" style="width: 100%; margin-bottom: 12px; background: transparent; color: var(--text-secondary); box-shadow: none;">
                        Skip for now
                    </button>
                    
                    <!-- Continue Button -->
                    <button id="continue-step1" class="btn-burnt-orange" style="width: 100%;">
                        Continue →
                    </button>
                    
                    <!-- Nudge Message -->
                    <div id="nudge-step1" style="text-align: center; margin-top: 16px; font-size: 12px; color: var(--accent-modern-red); display: none;">
                        ⚠️ Profiles without services are hidden from clients
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Render service chips
        renderServiceChips(SERVICES);
        
        // Setup search
        document.getElementById("service-search")?.addEventListener("input", (e) => {
            const query = e.target.value.toLowerCase();
            const filtered = SERVICES.filter(s => s.toLowerCase().includes(query));
            renderServiceChips(filtered);
        });
        
        // Setup buttons
        document.getElementById("skip-step1")?.addEventListener("click", () => {
            selectedServices = [];
            showNudge("step1");
            renderStep2();
        });
        
        document.getElementById("continue-step1")?.addEventListener("click", () => {
            if (selectedServices.length === 0) {
                showNudge("step1");
            }
            renderStep2();
        });
    }
    
    function renderServiceChips(services) {
        const grid = document.getElementById("services-grid");
        if (!grid) return;
        
        grid.innerHTML = "";
        services.forEach(service => {
            const chip = document.createElement("div");
            chip.textContent = service;
            chip.style.cssText = `
                padding: 10px 18px;
                background: var(--bg-secondary);
                border-radius: 40px;
                font-size: 14px;
                cursor: pointer;
                transition: all 0.2s ease;
                border: 1px solid var(--border-glass);
                color: var(--text-primary);
            `;
            
            if (selectedServices.includes(service)) {
                chip.style.background = "var(--accent-burnt-orange)";
                chip.style.color = "white";
                chip.style.border = "none";
            }
            
            chip.addEventListener("click", () => {
                const index = selectedServices.indexOf(service);
                if (index > -1) {
                    selectedServices.splice(index, 1);
                    chip.style.background = "var(--bg-secondary)";
                    chip.style.color = "var(--text-primary)";
                    chip.style.border = "1px solid var(--border-glass)";
                } else {
                    selectedServices.push(service);
                    chip.style.background = "var(--accent-burnt-orange)";
                    chip.style.color = "white";
                    chip.style.border = "none";
                }
            });
            
            grid.appendChild(chip);
        });
    }
    
    function renderStep2() {
        const container = document.getElementById("page-content");
        if (!container) return;
        
        const html = `
            <div class="auth-container" style="min-height: 100vh; background: var(--bg-primary); padding: 24px 16px;">
                <div style="max-width: 500px; margin: 0 auto;">
                    <!-- Progress Indicator -->
                    <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 32px;">
                        <div style="width: 40px; height: 4px; background: var(--accent-burnt-orange); border-radius: 4px;"></div>
                        <div style="width: 40px; height: 4px; background: var(--accent-burnt-orange); border-radius: 4px;"></div>
                        <div style="width: 40px; height: 4px; background: var(--text-tertiary); border-radius: 4px;"></div>
                    </div>
                    
                    <h1 style="font-size: 32px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 8px;">
                        Where do you work?
                    </h1>
                    <p style="color: var(--text-secondary); margin-bottom: 16px;">
                        Set your business location to appear in local searches.
                    </p>
                    
                    <!-- Address Text Input -->
                    <input type="text" id="workspace-address" placeholder="Business address (e.g., 23 Allen Avenue, Ikeja)" style="
                        width: 100%;
                        padding: 14px;
                        border-radius: 16px;
                        border: 1px solid var(--border-glass);
                        background: var(--bg-secondary);
                        color: var(--text-primary);
                        margin-bottom: 16px;
                        font-size: 14px;
                    ">
                    
                    <!-- Map Container -->
                    <div id="step2-map" style="height: 40vh; border-radius: 24px; overflow: hidden; margin-bottom: 16px;"></div>
                    
                    <!-- Confirm Location Button -->
                    <button id="confirm-location" class="btn-burnt-orange" style="width: 100%; margin-bottom: 12px;">
                        📍 Confirm Location
                    </button>
                    
                    <!-- Skip Button -->
                    <button id="skip-step2" class="btn-modern-red" style="width: 100%; margin-bottom: 12px; background: transparent; color: var(--text-secondary); box-shadow: none;">
                        Skip for now
                    </button>
                    
                    <!-- Continue Button -->
                    <button id="continue-step2" class="btn-burnt-orange" style="width: 100%;">
                        Continue →
                    </button>
                    
                    <!-- Nudge Message -->
                    <div id="nudge-step2" style="text-align: center; margin-top: 16px; font-size: 12px; color: var(--accent-modern-red); display: none;">
                        ⚠️ You won't appear in local search results without a location
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Initialize map
        initStep2Map();
        
        // Setup address input geocoding (basic)
        const addressInput = document.getElementById("workspace-address");
        addressInput?.addEventListener("change", () => {
            // Simple geocoding would go here - for MVP, just store text
            workspaceAddressText = addressInput.value;
        });
        
        document.getElementById("confirm-location")?.addEventListener("click", () => {
            if (marker && marker.getLatLng()) {
                const latlng = marker.getLatLng();
                workspaceLocation = { lat: latlng.lat, lng: latlng.lng };
                if (addressInput.value) workspaceAddressText = addressInput.value;
                
                // Visual feedback
                const btn = document.getElementById("confirm-location");
                btn.textContent = "✓ Location Confirmed";
                setTimeout(() => {
                    btn.textContent = "📍 Confirm Location";
                }, 1500);
            } else {
                alert("Please drag the pin to set your location");
            }
        });
        
        document.getElementById("skip-step2")?.addEventListener("click", () => {
            workspaceLocation = null;
            workspaceAddressText = "";
            showNudge("step2");
            renderStep3();
        });
        
        document.getElementById("continue-step2")?.addEventListener("click", () => {
            if (!workspaceLocation) {
                showNudge("step2");
            }
            renderStep3();
        });
    }
    
    function initStep2Map() {
        // Default: Lagos, Nigeria
        const defaultLat = 6.5244;
        const defaultLng = 3.3792;
        
        map = L.map("step2-map").setView([defaultLat, defaultLng], 13);
        
        L.tileLayer("https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png", {
            attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
        }).addTo(map);
        
        // Draggable marker
        marker = L.marker([defaultLat, defaultLng], { draggable: true }).addTo(map);
        
        marker.on("dragend", () => {
            const pos = marker.getLatLng();
            workspaceLocation = { lat: pos.lat, lng: pos.lng };
        });
        
        // Try to get user's current location
        navigator.geolocation.getCurrentPosition(
            (position) => {
                const userLat = position.coords.latitude;
                const userLng = position.coords.longitude;
                map.setView([userLat, userLng], 14);
                marker.setLatLng([userLat, userLng]);
                workspaceLocation = { lat: userLat, lng: userLng };
            },
            () => console.log("Location permission denied")
        );
    }
    
    function renderStep3() {
        const container = document.getElementById("page-content");
        if (!container) return;
        
        const html = `
            <div class="auth-container" style="min-height: 100vh; background: var(--bg-primary); padding: 24px 16px;">
                <div style="max-width: 500px; margin: 0 auto;">
                    <!-- Progress Indicator -->
                    <div style="display: flex; gap: 8px; justify-content: center; margin-bottom: 32px;">
                        <div style="width: 40px; height: 4px; background: var(--accent-burnt-orange); border-radius: 4px;"></div>
                        <div style="width: 40px; height: 4px; background: var(--accent-burnt-orange); border-radius: 4px;"></div>
                        <div style="width: 40px; height: 4px; background: var(--accent-burnt-orange); border-radius: 4px;"></div>
                    </div>
                    
                    <h1 style="font-size: 32px; font-weight: 700; letter-spacing: -0.5px; margin-bottom: 8px;">
                        Almost there!
                    </h1>
                    <p style="color: var(--text-secondary); margin-bottom: 24px;">
                        Complete your profile to connect with clients.
                    </p>
                    
                    <!-- Profile Photo Upload -->
                    <div style="text-align: center; margin-bottom: 24px;">
                        <div id="photo-preview" style="
                            width: 100px;
                            height: 100px;
                            border-radius: 50%;
                            background: var(--bg-secondary);
                            margin: 0 auto 12px;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            overflow: hidden;
                            cursor: pointer;
                            border: 2px dashed var(--accent-burnt-orange);
                        ">
                            <i class="fas fa-camera" style="font-size: 32px; color: var(--text-secondary);"></i>
                        </div>
                        <button id="upload-photo-btn" class="btn-modern-red" style="background: transparent; color: var(--accent-burnt-orange); box-shadow: none; padding: 8px 16px;">
                            Upload Profile Photo
                        </button>
                        <input type="file" id="photo-input" accept="image/*" style="display: none;">
                    </div>
                    
                    <!-- Name Input -->
                    <input type="text" id="full-name" placeholder="Full Name / Business Name" style="
                        width: 100%;
                        padding: 14px;
                        border-radius: 16px;
                        border: 1px solid var(--border-glass);
                        background: var(--bg-secondary);
                        color: var(--text-primary);
                        margin-bottom: 16px;
                        font-size: 14px;
                    ">
                    
                    <!-- Email Input -->
                    <input type="email" id="email" placeholder="Email address" style="
                        width: 100%;
                        padding: 14px;
                        border-radius: 16px;
                        border: 1px solid var(--border-glass);
                        background: var(--bg-secondary);
                        color: var(--text-primary);
                        margin-bottom: 16px;
                        font-size: 14px;
                    ">
                    
                    <!-- OTP Section (hidden initially) -->
                    <div id="otp-section" style="display: none;">
                        <input type="text" id="otp-code" placeholder="Enter 6-digit code" style="
                            width: 100%;
                            padding: 14px;
                            border-radius: 16px;
                            border: 1px solid var(--border-glass);
                            background: var(--bg-secondary);
                            color: var(--text-primary);
                            margin-bottom: 16px;
                            font-size: 14px;
                            text-align: center;
                            letter-spacing: 4px;
                        ">
                        <button id="verify-otp-btn" class="btn-burnt-orange" style="width: 100%; margin-bottom: 12px;">
                            Verify & Complete
                        </button>
                    </div>
                    
                    <!-- Send OTP Button -->
                    <button id="send-otp-btn" class="btn-burnt-orange" style="width: 100%; margin-bottom: 12px;">
                        Continue with Email →
                    </button>
                    
                    <!-- Social Auth -->
                    <div style="display: flex; gap: 16px; justify-content: center; margin-top: 20px;">
                        <button id="google-auth" style="
                            flex: 1;
                            padding: 12px;
                            border-radius: 60px;
                            background: var(--bg-secondary);
                            border: 1px solid var(--border-glass);
                            color: var(--text-primary);
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                        ">
                            <i class="fab fa-google"></i> Google
                        </button>
                        <button id="apple-auth" style="
                            flex: 1;
                            padding: 12px;
                            border-radius: 60px;
                            background: var(--bg-secondary);
                            border: 1px solid var(--border-glass);
                            color: var(--text-primary);
                            cursor: pointer;
                            display: flex;
                            align-items: center;
                            justify-content: center;
                            gap: 8px;
                        ">
                            <i class="fab fa-apple"></i> Apple
                        </button>
                    </div>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        // Photo upload logic
        let uploadedPhotoUrl = null;
        const photoInput = document.getElementById("photo-input");
        const photoPreview = document.getElementById("photo-preview");
        
        document.getElementById("upload-photo-btn")?.addEventListener("click", () => {
            photoInput.click();
        });
        
        photoInput?.addEventListener("change", async (e) => {
            const file = e.target.files[0];
            if (file && window.ImageKit) {
                try {
    const result = await window.ImageKit.uploadImage(file, "avatars");
    uploadedPhotoUrl = result.url;
    photoPreview.innerHTML = `<img src="${uploadedPhotoUrl}" style="width: 100%; height: 100%; object-fit: cover;">`;
    console.log("Upload success:", uploadedPhotoUrl);
} catch (err) {
    console.error("Upload failed:", err);
    alert("Upload failed: " + err.message);
}
            } else {
                alert("Please select an image file");
            }
        });
        
        // OTP flow
        let emailForOtp = "";
        
        document.getElementById("send-otp-btn")?.addEventListener("click", async () => {
            const email = document.getElementById("email")?.value.trim();
            const fullName = document.getElementById("full-name")?.value.trim();
            
            if (!email) {
                alert("Please enter your email");
                return;
            }
            if (!fullName) {
                alert("Please enter your name");
                return;
            }
            if (!uploadedPhotoUrl) {
                alert("Please upload a profile photo");
                return;
            }
            
            emailForOtp = email;
            
            try {
                const { error } = await window.SupabaseAPI.client.auth.signInWithOtp({
                    email: email,
                    options: {
                        shouldCreateUser: true,
                        data: {
                            full_name: fullName,
                            avatar_url: uploadedPhotoUrl
                        }
                    }
                });
                
                if (error) throw error;
                
                // Show OTP input
                document.getElementById("otp-section").style.display = "block";
                document.getElementById("send-otp-btn").style.display = "none";
                alert("6-digit code sent to your email!");
                
            } catch (error) {
                console.error("OTP error:", error);
                alert("Error sending code: " + error.message);
            }
        });
        
        document.getElementById("verify-otp-btn")?.addEventListener("click", async () => {
            const otp = document.getElementById("otp-code")?.value.trim();
            
            if (!otp || otp.length !== 6) {
                alert("Please enter the 6-digit code");
                return;
            }
            
            try {
                const { data, error } = await window.SupabaseAPI.client.auth.verifyOtp({
                    email: emailForOtp,
                    token: otp,
                    type: 'email'
                });
                
                if (error) throw error;
                
                // Create/update profile with collected data
                const userId = data.user.id;
                
                // Calculate visibility
                const hasServices = selectedServices.length > 0;
                const hasLocation = workspaceLocation !== null;
                const hasPhoto = uploadedPhotoUrl !== null;
                const isVisible = hasServices && hasLocation && hasPhoto;
                
                // Update profile
                await window.SupabaseAPI.updateProfile(userId, {
                    full_name: document.getElementById("full-name")?.value.trim(),
                    selected_services: selectedServices,
                    latitude: workspaceLocation?.lat || null,
                    longitude: workspaceLocation?.lng || null,
                    address_text: workspaceAddressText,
                    avatar_url: uploadedPhotoUrl,
                    is_visible: isVisible,
                    credits: 6
                });
                
                // Navigate to home
                if (window.Navigation) {
                    if (window.TabBar) window.TabBar.show();
                    window.Navigation.reset();
                    window.Navigation.navigateTo("home", {}, false);
                }
                
            } catch (error) {
                console.error("Verification error:", error);
                alert("Error verifying code: " + error.message);
            }
        });
        
        // Social auth placeholders
        document.getElementById("google-auth")?.addEventListener("click", () => {
            alert("Google sign-in coming soon. Use email OTP for now.");
        });
        
        document.getElementById("apple-auth")?.addEventListener("click", () => {
            alert("Apple sign-in coming soon. Use email OTP for now.");
        });
    }
    
    function showNudge(step) {
        const nudge = document.getElementById(`nudge-${step}`);
        if (nudge) {
            nudge.style.display = "block";
            setTimeout(() => {
                nudge.style.display = "none";
            }, 3000);
        }
    }
    
    // ===== Public API =====
    return {
        render,
        getCurrentStep: () => currentStep
    };
    
})();

window.AuthFlow = AuthFlow;
