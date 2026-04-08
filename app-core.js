// ========================================
// GigsCourt - Core Module (FIXED - Race Condition)
// Authentication, Navigation, UI, Onboarding
// ========================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, orderBy } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';

// Supabase configuration
const supabaseUrl = 'https://qifzdrkpxzosdturjpex.supabase.co';
const supabaseAnonKey = 'sb_publishable_QfKJ4jT8u_2HuUKmW-xvbQ_9acJvZw-';
const supabase = createClient(supabaseUrl, supabaseAnonKey);

// ========== INITIALIZATION ==========
const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Make globally available
window.auth = auth;
window.db = db;
window.app = app;
window.sendPasswordResetEmail = sendPasswordResetEmail;

// ========== DOM ELEMENTS ==========
let splashScreen, mainApp, bottomNav, header, pageContainer, bottomSheet, sheetOverlay, sheetContent, toastContainer, notificationsBtn, notificationsDropdown, notificationsList, clearNotificationsBtn, notificationBadge;

// ========== STATE ==========
window.currentUser = null;
window.currentUserData = null;
let currentPage = 'home';
let scrollPositions = {
    home: 0,
    search: 0,
    chats: 0,
    profile: 0
};
let lastScrollY = 0;
let isNavHidden = false;
let appReadyFired = false;
let appReadyTimeout = null;

// ========== PRESET SERVICES (30) ==========
const PRESET_SERVICES = [
    "Tailoring / fashion design", "Barbing (men's haircutting)", "Hairdressing (braiding, wigs, styling)",
    "Makeup artistry", "Shoe making / cobbling", "Phone repairs (hardware/software)",
    "Computer repairs", "Electrical installation (wiring, fittings)", "Plumbing",
    "Carpentry / furniture making", "Masonry / bricklaying", "Welding / metal fabrication",
    "Tiling (floor/wall)", "POP ceiling installation", "Painting (house painting)",
    "Auto mechanic (car repair)", "Motorcycle/tricycle repair", "Catering (event cooking)",
    "Baking (cakes, pastries)", "Event decoration", "CCTV installation",
    "Solar panel installation", "Generator repair", "AC (air conditioner) repair",
    "Aluminum work (windows/doors)", "Interior decoration (home setup)",
    "Laundry / dry cleaning service", "Upholstery (sofa/seat making & repair)",
    "Printing & branding (flex, banners, T-shirts)", "POP screeding / wall finishing"
];

// ========== HAPTIC FEEDBACK ==========
function haptic(type = 'light') {
    if (!window.navigator.vibrate) return;
    if (type === 'light') window.navigator.vibrate(10);
    else if (type === 'heavy') window.navigator.vibrate(50);
}

// ========== TOAST ==========
function showToast(message, type = 'info') {
    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `<span>${message}</span>`;
    toastContainer.appendChild(toast);
    setTimeout(() => {
        toast.style.opacity = '0';
        setTimeout(() => toast.remove(), 300);
    }, 3000);
}

// ========== BOTTOM SHEET ==========
function openBottomSheet(contentHtml) {
    sheetContent.innerHTML = contentHtml;
    bottomSheet.classList.remove('hidden');
    bottomSheet.classList.add('open');
    sheetOverlay.classList.remove('hidden');
    sheetOverlay.classList.add('visible');
    haptic('light');
    document.body.style.overflow = 'hidden';
}

function closeBottomSheet() {
    bottomSheet.classList.remove('open');
    bottomSheet.classList.add('hidden');
    sheetOverlay.classList.remove('visible');
    sheetOverlay.classList.add('hidden');
    document.body.style.overflow = '';
}

function setupBottomSheet() {
    const dragHandle = document.querySelector('.sheet-drag-handle');
    let startY = 0;
    if (dragHandle) {
        dragHandle.addEventListener('touchstart', (e) => {
            startY = e.touches[0].clientY;
        });
        dragHandle.addEventListener('touchmove', (e) => {
            const delta = e.touches[0].clientY - startY;
            if (delta > 50) closeBottomSheet();
        });
    }
    if (sheetOverlay) sheetOverlay.addEventListener('click', closeBottomSheet);
}

// ========== NOTIFICATION DROPDOWN ==========
function setupNotifications() {
    if (!notificationsBtn) return;
    notificationsBtn.addEventListener('click', () => {
        notificationsDropdown.classList.toggle('hidden');
        haptic('light');
    });
    if (clearNotificationsBtn) {
        clearNotificationsBtn.addEventListener('click', () => {
            const items = notificationsList.querySelectorAll('.notification-item');
            items.forEach(item => item.remove());
            notificationsList.innerHTML = '<div class="empty-state">No notifications yet</div>';
            notificationBadge.classList.add('hidden');
        });
    }
    document.addEventListener('click', (e) => {
        if (notificationsBtn && notificationsDropdown && !notificationsBtn.contains(e.target) && !notificationsDropdown.contains(e.target)) {
            notificationsDropdown.classList.add('hidden');
        }
    });
}

function addNotification(title, body, link = '') {
    const emptyState = notificationsList.querySelector('.empty-state');
    if (emptyState) emptyState.remove();
    const item = document.createElement('div');
    item.className = 'notification-item';
    item.innerHTML = `
        <div class="notification-title">${title}</div>
        <div class="notification-body">${body}</div>
    `;
    if (link) item.addEventListener('click', () => { window.location.hash = link; closeBottomSheet(); });
    notificationsList.insertBefore(item, notificationsList.firstChild);
    let count = notificationsList.children.length;
    if (count > 0) {
        notificationBadge.textContent = count;
        notificationBadge.classList.remove('hidden');
    }
}

// ========== PAGE NAVIGATION ==========
function saveScrollPosition() {
    const activePage = document.querySelector('.page.active');
    if (activePage) {
        scrollPositions[currentPage] = activePage.scrollTop || 0;
    }
}

function restoreScrollPosition(pageId) {
    const targetPage = document.getElementById(`${pageId}-page`);
    if (targetPage && scrollPositions[pageId]) {
        targetPage.scrollTop = scrollPositions[pageId];
    }
}

function navigateToPage(pageId) {
    saveScrollPosition();
    const pages = document.querySelectorAll('.page');
    const navItems = document.querySelectorAll('.nav-item');
    pages.forEach(page => page.classList.remove('active'));
    const targetPage = document.getElementById(`${pageId}-page`);
    if (targetPage) targetPage.classList.add('active');
    navItems.forEach(item => {
        item.classList.remove('active');
        if (item.dataset.page === pageId) item.classList.add('active');
    });
    currentPage = pageId;
    restoreScrollPosition(pageId);
    haptic('light');
    
    // Dispatch event for features file
    window.dispatchEvent(new CustomEvent('navigate', { detail: { page: pageId } }));
}

function setupNavigation() {
    const navItems = document.querySelectorAll('.nav-item');
    navItems.forEach(item => {
        item.addEventListener('click', () => {
            const pageId = item.dataset.page;
            navigateToPage(pageId);
        });
    });
}

// ========== SCROLL HANDLER ==========
function setupScrollHandlers() {
    const homePage = document.getElementById('home-page');
    const homeHeader = document.querySelector('.home-header');
    
    if (!homePage || !homeHeader) return;
    
    homePage.addEventListener('scroll', () => {
        const scrollY = homePage.scrollTop;
        
        // Shrink header when scrolling down
        if (scrollY > 10) {
            homeHeader.classList.add('shrunk');
        } else {
            homeHeader.classList.remove('shrunk');
        }
        
        // Hide bottom nav on scroll down, show on scroll up
        if (scrollY > lastScrollY && scrollY > 50) {
            if (!isNavHidden) {
                bottomNav.classList.add('hidden');
                isNavHidden = true;
            }
        } else if (scrollY < lastScrollY) {
            if (isNavHidden) {
                bottomNav.classList.remove('hidden');
                isNavHidden = false;
            }
        }
        
        lastScrollY = scrollY;
        saveScrollPosition();
    });
}

// ========== ONBOARDING FLOW ==========
let onboardingData = {};

// ========== ONBOARDING SCREEN CONTROLS ==========
let currentOnboardingStep = 1;

function showOnboardingScreen() {
    const onboardingScreen = document.getElementById('onboarding-screen');
    const mainApp = document.getElementById('main-app');
    
    if (onboardingScreen) {
        onboardingScreen.classList.remove('hidden');
    }
    if (mainApp) {
        mainApp.style.display = 'none';
    }
    document.body.style.overflow = 'hidden';
}

function hideOnboardingScreen() {
    const onboardingScreen = document.getElementById('onboarding-screen');
    const mainApp = document.getElementById('main-app');
    
    if (onboardingScreen) {
        onboardingScreen.classList.add('hidden');
    }
    if (mainApp) {
        mainApp.style.display = 'block';
    }
    document.body.style.overflow = '';
}

function updateOnboardingStepIndicator(step, total) {
    const indicator = document.getElementById('onboarding-step-indicator');
    if (indicator) {
        indicator.textContent = `Step ${step} of ${total}`;
    }
}

function showOnboardingBackButton(show) {
    const backBtn = document.getElementById('onboarding-back-btn');
    if (backBtn) {
        if (show) {
            backBtn.classList.remove('hidden');
        } else {
            backBtn.classList.add('hidden');
        }
    }
}

function setOnboardingNextButtonText(text) {
    const nextBtn = document.getElementById('onboarding-next-btn');
    if (nextBtn) {
        nextBtn.textContent = text;
    }
}

function showOnboarding() {
    // Reset onboarding data if needed
    if (!onboardingData.displayName) {
        onboardingData = {};
    }
    showOnboardingStep1();
}

function showOnboardingStep1() {
    currentOnboardingStep = 1;
    updateOnboardingStepIndicator(1, 5);
    showOnboardingBackButton(false);
    setOnboardingNextButtonText('Continue');
    
    const content = `
        <h2 class="onboarding-title">Welcome to GigsCourt! 👋</h2>
        <p class="onboarding-subtitle">Let's set up your profile in a few steps</p>
        <input type="text" id="onboard-name" placeholder="Full name" class="onboarding-input" value="${onboardingData.displayName || ''}">
        <input type="tel" id="onboard-phone" placeholder="Phone number (e.g., 08012345678)" class="onboarding-input" value="${onboardingData.phone || ''}">
    `;
    
    document.getElementById('onboarding-content').innerHTML = content;
    showOnboardingScreen();
    
    // Setup next button handler
    const nextBtn = document.getElementById('onboarding-next-btn');
    const oldNext = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(oldNext, nextBtn);
    
    oldNext.addEventListener('click', () => {
        const name = document.getElementById('onboard-name').value.trim();
        const phone = document.getElementById('onboard-phone').value.trim();
        
        if (!name) {
    showToast('Please enter your full name', 'error');
    return;
}
// Phone number is optional - no validation needed
        
        onboardingData.displayName = name;
        onboardingData.phone = phone;
        showOnboardingStep2();
    });
    
    // Setup close button
    const closeBtn = document.getElementById('onboarding-close-btn');
    if (closeBtn) {
        const newCloseBtn = closeBtn.cloneNode(true);
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        newCloseBtn.addEventListener('click', () => {
            if (confirm('Are you sure? Your progress will be lost.')) {
                hideOnboardingScreen();
                showAuthScreen();
            }
        });
    }
}

function showOnboardingStep2() {
    currentOnboardingStep = 2;
    updateOnboardingStepIndicator(2, 5);
    showOnboardingBackButton(true);
    setOnboardingNextButtonText('Continue');
    
    let selectedServices = [...(onboardingData.services || [])];
    
    const servicesHtml = PRESET_SERVICES.map(service => `
        <div class="onboarding-service-option ${selectedServices.includes(service) ? 'selected' : ''}" data-service="${service}">
            ${service}
        </div>
    `).join('');
    
    const content = `
        <h2 class="onboarding-title">What services do you offer?</h2>
        <p class="onboarding-subtitle">Select all that apply</p>
        <div class="onboarding-services-list" id="onboarding-services-list">
            ${servicesHtml}
        </div>
    `;
    
    document.getElementById('onboarding-content').innerHTML = content;
    
    // Attach service selection handlers
    document.querySelectorAll('.onboarding-service-option').forEach(opt => {
        opt.addEventListener('click', () => {
            const service = opt.dataset.service;
            if (selectedServices.includes(service)) {
                selectedServices = selectedServices.filter(s => s !== service);
                opt.classList.remove('selected');
            } else {
                selectedServices.push(service);
                opt.classList.add('selected');
            }
        });
    });
    
    // Setup next button
    const nextBtn = document.getElementById('onboarding-next-btn');
    const oldNext = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(oldNext, nextBtn);
    
    oldNext.addEventListener('click', () => {
        if (selectedServices.length === 0) {
            showToast('Please select at least one service', 'error');
            return;
        }
        onboardingData.services = selectedServices;
        showOnboardingStep3();
    });
    
    // Setup back button
    const backBtn = document.getElementById('onboarding-back-btn');
    const oldBack = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(oldBack, backBtn);
    
    oldBack.addEventListener('click', () => {
        showOnboardingStep1();
    });
}

function showOnboardingStep3() {
    currentOnboardingStep = 3;
    updateOnboardingStepIndicator(3, 5);
    showOnboardingBackButton(true);
    setOnboardingNextButtonText('Continue');
    
    const content = `
        <h2 class="onboarding-title">Where is your workspace?</h2>
        <p class="onboarding-subtitle">Drop a pin on the map or describe your location</p>
        <div id="onboarding-map" class="onboarding-map"></div>
        <input type="text" id="onboard-address" placeholder="Describe your address (e.g., beside First Bank, Lagos)" class="onboarding-input" value="${onboardingData.addressText || ''}">
    `;
    
    document.getElementById('onboarding-content').innerHTML = content;
    
    // Initialize map
    setTimeout(() => {
        if (window.L && document.getElementById('onboarding-map')) {
            // Try to get user's current location first
            let defaultLat = 6.5244;
            let defaultLng = 3.3792;
            
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        defaultLat = position.coords.latitude;
                        defaultLng = position.coords.longitude;
                        // Center map on user's location
                        map.setView([defaultLat, defaultLng], 13);
                    },
                    () => {
                        // User denied or error, keep default Lagos
                        console.log('Could not get user location, using default');
                    }
                );
            }
            
            const map = L.map('onboarding-map').setView([defaultLat, defaultLng], 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            }).addTo(map);
            
            let marker = null;
            if (onboardingData.location) {
                marker = L.marker([onboardingData.location.lat, onboardingData.location.lng]).addTo(map);
                map.setView([onboardingData.location.lat, onboardingData.location.lng], 13);
            }
            
            map.on('click', (e) => {
                if (marker) marker.remove();
                marker = L.marker(e.latlng).addTo(map);
                onboardingData.location = { lat: e.latlng.lat, lng: e.latlng.lng };
            });
        }
    }, 100);
    
    // Setup next button
    const nextBtn = document.getElementById('onboarding-next-btn');
    const oldNext = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(oldNext, nextBtn);
    
    oldNext.addEventListener('click', () => {
        const address = document.getElementById('onboard-address').value.trim();
        if (!address && !onboardingData.location) {
            showToast('Please set a location on map or enter address', 'error');
            return;
        }
        onboardingData.addressText = address;
        showOnboardingStep4();
    });
    
    // Setup back button
    const backBtn = document.getElementById('onboarding-back-btn');
    const oldBack = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(oldBack, backBtn);
    
    oldBack.addEventListener('click', () => {
        showOnboardingStep2();
    });
}

function showOnboardingStep4() {
    currentOnboardingStep = 4;
    updateOnboardingStepIndicator(4, 5);
    showOnboardingBackButton(true);
    setOnboardingNextButtonText('Got it!');
    
    const content = `
        <h2 class="onboarding-title">How Credits Work 💰</h2>
        <div class="onboarding-info-box">
            <p>✅ 1 credit = 1 gig registration</p>
            <p>✅ Credits deducted ONLY after client reviews you</p>
            <p>✅ Buy credits: 5 for ₦2500 | 10 for ₦4500 | 20 for ₦8000</p>
            <p>✅ Without credits, you can still receive messages, just can't register gigs</p>
        </div>
    `;
    
    document.getElementById('onboarding-content').innerHTML = content;
    
    // Setup next button
    const nextBtn = document.getElementById('onboarding-next-btn');
    const oldNext = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(oldNext, nextBtn);
    
    oldNext.addEventListener('click', () => {
        showOnboardingStep5();
    });
    
    // Setup back button
    const backBtn = document.getElementById('onboarding-back-btn');
    const oldBack = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(oldBack, backBtn);
    
    oldBack.addEventListener('click', () => {
        showOnboardingStep3();
    });
}

function showOnboardingStep5() {
    currentOnboardingStep = 5;
    updateOnboardingStepIndicator(5, 5);
    showOnboardingBackButton(true);
    setOnboardingNextButtonText('Complete Setup');
    
    const content = `
        <h2 class="onboarding-title">Almost done!</h2>
        <p class="onboarding-subtitle">Add a profile photo (optional)</p>
        <div id="onboarding-photo-preview" class="onboarding-photo-preview">
            ${onboardingData.photoFile ? '<img src="' + URL.createObjectURL(onboardingData.photoFile) + '">' : '📸'}
        </div>
        <input type="file" id="onboarding-profile-photo" accept="image/*" style="display: none;">
        <textarea id="onboard-bio" placeholder="Tell clients about yourself (optional)" class="onboarding-textarea">${onboardingData.bio || ''}</textarea>
    `;
    
    document.getElementById('onboarding-content').innerHTML = content;
    
    // Photo preview click handler
    const preview = document.getElementById('onboarding-photo-preview');
    const fileInput = document.getElementById('onboarding-profile-photo');
    
    if (preview) {
        preview.addEventListener('click', () => {
            fileInput.click();
        });
    }
    
    if (fileInput) {
        fileInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    preview.innerHTML = `<img src="${event.target.result}">`;
                    onboardingData.photoFile = file;
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    // Setup next button (Complete Setup)
    const nextBtn = document.getElementById('onboarding-next-btn');
    const oldNext = nextBtn.cloneNode(true);
    nextBtn.parentNode.replaceChild(oldNext, nextBtn);
    
    oldNext.addEventListener('click', async () => {
        onboardingData.bio = document.getElementById('onboard-bio').value;
        
        // Upload photo if exists
        if (onboardingData.photoFile) {
            showToast('Uploading photo...');
            try {
                const photoURL = await uploadImage(onboardingData.photoFile, 'profiles');
                onboardingData.photoURL = photoURL;
            } catch (error) {
                console.error('Photo upload error:', error);
            }
        }
        
        showToast('Saving your profile...');
        await saveUserProfile();
        hideOnboardingScreen();
        navigateToPage('home');
        showToast('Welcome to GigsCourt! 🎉');
    });
    
    // Setup back button
    const backBtn = document.getElementById('onboarding-back-btn');
    const oldBack = backBtn.cloneNode(true);
    backBtn.parentNode.replaceChild(oldBack, backBtn);
    
    oldBack.addEventListener('click', () => {
        showOnboardingStep4();
    });
}

async function saveUserProfile() {
    if (!window.currentUser) {
        console.error('No current user');
        return;
    }
    const userRef = doc(db, 'users', window.currentUser.uid);
    await setDoc(userRef, {
        displayName: onboardingData.displayName,
        phone: onboardingData.phone,
        services: onboardingData.services,
        location: onboardingData.location || null,
        addressText: onboardingData.addressText || '',
        bio: onboardingData.bio || '',
        photoURL: onboardingData.photoURL || null,
        credits: 0,
        gigCount: 0,
        rating: 0,
        totalRatingSum: 0,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
    }, { merge: true });
    
    const updateData = { displayName: onboardingData.displayName };
    if (onboardingData.photoURL) {
        updateData.photoURL = onboardingData.photoURL;
    }
    await updateProfile(window.currentUser, updateData);
    
    // ========================================
    // SYNC TO SUPABASE (for home feed) - using UPSERT to prevent duplicates
    // ========================================
    if (onboardingData.location && onboardingData.location.lat && onboardingData.location.lng) {
        try {
            const { error: supabaseError } = await supabase
                .from('provider_locations')
                .upsert({
                    user_id: window.currentUser.uid,
                    lat: onboardingData.location.lat,
                    lng: onboardingData.location.lng,
                    location: `POINT(${onboardingData.location.lng} ${onboardingData.location.lat})`,
                    service: onboardingData.services && onboardingData.services.length > 0 ? onboardingData.services[0] : null,
                    rating: 0,
                    last_gig_date: null,
                    monthly_gig_count: 0
                }, { onConflict: 'user_id' });
            
            if (supabaseError) {
                console.error('Supabase sync error:', supabaseError);
            } else {
                console.log('Supabase sync successful for user:', window.currentUser.uid);
            }
        } catch (err) {
            console.error('Failed to sync to Supabase:', err);
        }
    } else {
        console.warn('No location data available, skipping Supabase sync. Location:', onboardingData.location);
    }
}

// ========== AUTH UI ==========
function showAuthScreen() {
    const authScreen = document.getElementById('auth-screen');
    const mainApp = document.getElementById('main-app');
    
    if (authScreen) {
        authScreen.classList.remove('hidden');
    }
    if (mainApp) {
        mainApp.style.display = 'none';
    }
    
    // Tab switching
    const loginTab = document.getElementById('auth-login-tab');
    const signupTab = document.getElementById('auth-signup-tab');
    const loginPanel = document.getElementById('auth-login-panel');
    const signupPanel = document.getElementById('auth-signup-panel');
    
    if (loginTab && signupTab) {
        loginTab.onclick = () => {
            loginTab.classList.add('active');
            signupTab.classList.remove('active');
            loginPanel.classList.add('active');
            signupPanel.classList.remove('active');
        };
        
        signupTab.onclick = () => {
            signupTab.classList.add('active');
            loginTab.classList.remove('active');
            signupPanel.classList.add('active');
            loginPanel.classList.remove('active');
        };
    }
    
    // Login - Using addEventListener instead of onclick
    const loginBtn = document.getElementById('login-btn');
    if (loginBtn) {
        // Remove any existing listeners
        const newLoginBtn = loginBtn.cloneNode(true);
        loginBtn.parentNode.replaceChild(newLoginBtn, loginBtn);
        
        newLoginBtn.addEventListener('click', async () => {
            console.log('Login button clicked'); // Debug log
            
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            
            if (!email || !password) {
                showToast('Please enter email and password', 'error');
                return;
            }
            
            try {
                showToast('Logging in...');
                const userCred = await signInWithEmailAndPassword(auth, email, password);
                window.currentUser = userCred.user;
                hideAuthScreen();
                showToast('Welcome back!');
            } catch (error) {
                console.error('Login error:', error);
                if (error.code === 'auth/user-not-found') {
                    showToast('No account found with this email', 'error');
                } else if (error.code === 'auth/wrong-password') {
                    showToast('Incorrect password', 'error');
                } else if (error.code === 'auth/invalid-email') {
                    showToast('Invalid email address', 'error');
                } else {
                    showToast(error.message, 'error');
                }
            }
        });
    }
    
// Signup - Using addEventListener instead of onclick (Email + Password + Confirm Password only)
    const signupBtn = document.getElementById('signup-btn');
    if (signupBtn) {
        // Remove any existing listeners to prevent duplicates
        const newSignupBtn = signupBtn.cloneNode(true);
        signupBtn.parentNode.replaceChild(newSignupBtn, signupBtn);
        
        newSignupBtn.addEventListener('click', async () => {
            console.log('Signup button clicked'); // Debug log
            
            const email = document.getElementById('signup-email').value.trim();
            const password = document.getElementById('signup-password').value;
            const confirmPassword = document.getElementById('signup-confirm-password').value;
            
            // Validation
            if (!email) {
                showToast('Please enter your email', 'error');
                return;
            }
            if (!password) {
                showToast('Please enter a password', 'error');
                return;
            }
            if (password.length < 6) {
                showToast('Password must be at least 6 characters', 'error');
                return;
            }
            if (password !== confirmPassword) {
                showToast('Passwords do not match', 'error');
                return;
            }
            
            try {
                showToast('Creating account...');
                const userCred = await createUserWithEmailAndPassword(auth, email, password);
                window.currentUser = userCred.user;
                
                // Send email verification
                await sendEmailVerification(auth.currentUser);
                
                // Store email for later (name and phone will be collected in onboarding)
                onboardingData.email = email;
                
                // Show verification required screen instead of onboarding
                showVerificationRequiredScreen();
                
            } catch (error) {
                console.error('Signup error:', error);
                if (error.code === 'auth/email-already-in-use') {
                    showToast('Email already in use. Please login instead.', 'error');
                } else if (error.code === 'auth/invalid-email') {
                    showToast('Invalid email address', 'error');
                } else if (error.code === 'auth/weak-password') {
                    showToast('Password is too weak. Use at least 6 characters.', 'error');
                } else {
                    showToast(error.message, 'error');
                }
            }
        });
    }
    
    // Forgot password
    const forgotBtn = document.getElementById('forgot-password-btn');
    if (forgotBtn) {
        const newForgotBtn = forgotBtn.cloneNode(true);
        forgotBtn.parentNode.replaceChild(newForgotBtn, forgotBtn);
        
        newForgotBtn.addEventListener('click', async () => {
            const email = document.getElementById('login-email').value.trim();
            if (!email) {
                showToast('Enter your email address first', 'error');
                return;
            }
            try {
                await sendPasswordResetEmail(auth, email);
                showToast('Password reset email sent! Check your inbox.');
            } catch (error) {
                console.error('Reset error:', error);
                if (error.code === 'auth/user-not-found') {
                    showToast('No account found with this email', 'error');
                } else {
                    showToast(error.message, 'error');
                }
            }
        });
    }
}

function hideAuthScreen() {
    const authScreen = document.getElementById('auth-screen');
    const mainApp = document.getElementById('main-app');
    
    if (authScreen) {
        authScreen.classList.add('hidden');
    }
    if (mainApp) {
        mainApp.style.display = 'block';
    }
}

// ========== EMAIL VERIFICATION SCREEN ==========
function showVerificationRequiredScreen() {
    // Hide main app and auth screen
    const mainApp = document.getElementById('main-app');
    const authScreen = document.getElementById('auth-screen');
    
    if (authScreen) {
        authScreen.classList.add('hidden');
    }
    if (mainApp) {
        mainApp.style.display = 'none';
    }
    
    // Create a temporary verification screen if it doesn't exist
    let verificationScreen = document.getElementById('verification-screen');
    if (!verificationScreen) {
        verificationScreen = document.createElement('div');
        verificationScreen.id = 'verification-screen';
        verificationScreen.className = 'verification-screen';
        verificationScreen.innerHTML = `
            <div class="verification-container">
                <div class="verification-logo">
                    <span>Gigs</span><span>Court</span>
                </div>
                <h2>Verify Your Email</h2>
                <p class="verification-subtitle">We've sent a verification email to <strong id="verification-email"></strong></p>
                <p class="verification-instruction">Please check your inbox and click the verification link.</p>
                <button id="resend-verification-btn" class="verification-btn-primary">Resend Email</button>
                <button id="verification-logout-btn" class="verification-btn-secondary">Back to Login</button>
            </div>
        `;
        document.body.appendChild(verificationScreen);
    }
    
    // Update email display
    const emailSpan = document.getElementById('verification-email');
    if (emailSpan && window.currentUser) {
        emailSpan.textContent = window.currentUser.email;
    }
    
    verificationScreen.classList.remove('hidden');
    
    // Resend button
    const resendBtn = document.getElementById('resend-verification-btn');
    if (resendBtn) {
        const newResendBtn = resendBtn.cloneNode(true);
        resendBtn.parentNode.replaceChild(newResendBtn, resendBtn);
        newResendBtn.addEventListener('click', async () => {
            if (window.currentUser) {
                await sendEmailVerification(window.currentUser);
                showToast('Verification email resent! Check your inbox.');
            }
        });
    }
    
    // Back to login button
    const logoutBtn = document.getElementById('verification-logout-btn');
    if (logoutBtn) {
        const newLogoutBtn = logoutBtn.cloneNode(true);
        logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
        newLogoutBtn.addEventListener('click', async () => {
            // Sign out and go back to auth screen
            await signOut(auth);
            const screen = document.getElementById('verification-screen');
            if (screen) screen.classList.add('hidden');
            showAuthScreen();
        });
    }
    
    // Check periodically if email is verified
    const checkInterval = setInterval(async () => {
        if (window.currentUser) {
            await window.currentUser.reload();
            if (window.currentUser.emailVerified) {
                clearInterval(checkInterval);
                // Hide verification screen
                const screen = document.getElementById('verification-screen');
                if (screen) screen.classList.add('hidden');
                // Show onboarding
                showOnboarding();
            }
        }
    }, 3000);
}

function hideVerificationScreen() {
    const screen = document.getElementById('verification-screen');
    if (screen) {
        screen.classList.add('hidden');
    }
}

// ========== AUTH STATE LISTENER ==========
function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        window.currentUser = user;
        
        if (user) {
            // User is logged in
            try {
                const userDoc = await getDoc(doc(db, 'users', user.uid));
                if (userDoc.exists()) {
                    window.currentUserData = userDoc.data();
                    // Existing user - hide auth screen, show main app
                    hideAuthScreen();
                    if (!appReadyFired) {
                        appReadyFired = true;
                        window.dispatchEvent(new CustomEvent('appReady'));
                    }
                    navigateToPage('home');
                } else {
    // New user - needs email verification first
    hideAuthScreen();
    if (!appReadyFired) {
        appReadyFired = true;
        window.dispatchEvent(new CustomEvent('appReady'));
    }
    
    // Check if email is verified
    if (user.emailVerified) {
        showOnboarding();
    } else {
        showVerificationRequiredScreen();
    }
}
            } catch (error) {
                console.error('Error loading user data:', error);
                if (!appReadyFired) {
                    appReadyFired = true;
                    window.dispatchEvent(new CustomEvent('appReady'));
                }
                showToast('Error loading profile. Please refresh.', 'error');
            }
        } else {
            // No user logged in - show auth screen, hide main app
            window.currentUserData = null;
            showAuthScreen();
        }
    });
}

// ========== PROFILE PICTURE BOTTOM SHEET ==========
function setupProfilePictureHandler() {
    document.addEventListener('click', (e) => {
        const avatar = e.target.closest('.profile-avatar, .card-avatar, .chat-avatar');
        if (avatar && avatar.src) {
            haptic('light');
            openBottomSheet(`
                <img src="${avatar.src}" style="width: 100%; border-radius: 20px; margin-bottom: 16px;">
                <button id="close-sheet-btn" class="btn-secondary" style="width: 100%; padding: 12px; border-radius: 30px;">Close</button>
            `);
            document.getElementById('close-sheet-btn').addEventListener('click', closeBottomSheet);
        }
    });
}

// ========== INITIALIZE CORE ==========
document.addEventListener('DOMContentLoaded', () => {
    // Get DOM elements
    splashScreen = document.getElementById('splash-screen');
    mainApp = document.getElementById('main-app');
    bottomNav = document.getElementById('bottom-nav');
    header = document.getElementById('app-header');
    pageContainer = document.getElementById('page-container');
    bottomSheet = document.getElementById('bottom-sheet');
    sheetOverlay = document.getElementById('sheet-overlay');
    sheetContent = document.getElementById('sheet-content');
    toastContainer = document.getElementById('toast-container');
    notificationsBtn = document.getElementById('notifications-btn');
    notificationsDropdown = document.getElementById('notifications-dropdown');
    notificationsList = document.getElementById('notifications-list');
    clearNotificationsBtn = document.getElementById('clear-notifications');
    notificationBadge = document.getElementById('notification-badge');
    
    // Make sure main app is HIDDEN initially (only shown after login)
    if (mainApp) {
        mainApp.style.display = 'none';
    }
    
    // Setup all core features that don't depend on auth
    setupBottomSheet();
    setupNavigation();
    setupScrollHandlers();
    setupNotifications();
    setupProfilePictureHandler();
    
    // Setup auth listener (this will show auth screen or main app based on login state)
    setupAuthListener();
    
    // Hide splash screen after timeout
    setTimeout(() => {
        if (splashScreen) {
            splashScreen.style.opacity = '0';
            setTimeout(() => {
                splashScreen.style.display = 'none';
            }, 500);
        }
    }, 1500);
});

// Expose functions for features file
window.showToast = showToast;
window.openBottomSheet = openBottomSheet;
window.closeBottomSheet = closeBottomSheet;
window.addNotification = addNotification;
window.navigateToPage = navigateToPage;
window.PRESET_SERVICES = PRESET_SERVICES;
window.haptic = haptic;
window.db = db;
window.auth = auth;
window.updateProfile = updateProfile;
window.signOut = signOut;

// Force appReady after a short delay to ensure everything is loaded
setTimeout(() => {
    if (!appReadyFired && window.db && window.auth) {
        appReadyFired = true;
        window.dispatchEvent(new CustomEvent('appReady'));
    }
}, 1000);
