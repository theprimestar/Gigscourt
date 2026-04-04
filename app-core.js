// ========================================
// GigsCourt - Core Module (FIXED)
// Authentication, Navigation, UI, Onboarding
// ========================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, orderBy } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

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
let currentPage = 'home';
let scrollPositions = {
    home: 0,
    search: 0,
    chats: 0,
    profile: 0
};
let lastScrollY = 0;
let isNavHidden = false;

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
    bottomSheet.classList.add('open');
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
    const pages = document.querySelectorAll('.page');
    pages.forEach(page => {
        page.addEventListener('scroll', () => {
            const currentScrollY = page.scrollTop;
            const header = document.getElementById('app-header');
            if (currentScrollY > lastScrollY && currentScrollY > 50) {
                if (!isNavHidden) {
                    bottomNav.classList.add('hidden');
                    if (header) header.style.transform = 'translateY(-100%)';
                    isNavHidden = true;
                }
            } else if (currentScrollY < lastScrollY) {
                if (isNavHidden) {
                    bottomNav.classList.remove('hidden');
                    if (header) header.style.transform = 'translateY(0)';
                    isNavHidden = false;
                }
            }
            lastScrollY = currentScrollY;
            saveScrollPosition();
        });
    });
}

// ========== ONBOARDING FLOW ==========
let onboardingData = {};

function showOnboarding() {
    showOnboardingStep1();
}

function showOnboardingStep1() {
    openBottomSheet(`
        <h3 style="margin-bottom: 16px;">Welcome to GigsCourt! 👋</h3>
        <p style="margin-bottom: 24px; color: var(--text-secondary);">Let's set up your profile in a few steps</p>
        <input type="text" id="onboard-name" placeholder="Full name" class="search-input" style="margin-bottom: 12px;">
        <input type="tel" id="onboard-phone" placeholder="Phone number (e.g., 08012345678)" class="search-input" style="margin-bottom: 24px;">
        <button id="onboard-next-1" class="btn-primary" style="width: 100%; padding: 14px; border-radius: 30px;">Continue</button>
    `);
    document.getElementById('onboard-next-1').addEventListener('click', () => {
        const name = document.getElementById('onboard-name').value;
        const phone = document.getElementById('onboard-phone').value;
        if (!name || !phone) {
            showToast('Please enter name and phone number');
            return;
        }
        onboardingData.displayName = name;
        onboardingData.phone = phone;
        closeBottomSheet();
        showOnboardingStep2();
    });
}

function showOnboardingStep2() {
    let selectedServices = [];
    const servicesHtml = PRESET_SERVICES.map(service => `
        <div class="service-option" data-service="${service}" style="padding: 12px; background: var(--bg-secondary); border-radius: 10px; margin-bottom: 8px; cursor: pointer;">
            ${service}
        </div>
    `).join('');
    openBottomSheet(`
        <h3 style="margin-bottom: 16px;">What services do you offer?</h3>
        <p style="margin-bottom: 16px; color: var(--text-secondary);">Select all that apply</p>
        <div id="services-list" style="max-height: 400px; overflow-y: auto;">${servicesHtml}</div>
        <button id="onboard-next-2" class="btn-primary" style="width: 100%; padding: 14px; border-radius: 30px; margin-top: 16px;">Continue (${selectedServices.length} selected)</button>
    `);
    const serviceOptions = document.querySelectorAll('.service-option');
    const nextBtn = document.getElementById('onboard-next-2');
    serviceOptions.forEach(opt => {
        opt.addEventListener('click', () => {
            const service = opt.dataset.service;
            if (selectedServices.includes(service)) {
                selectedServices = selectedServices.filter(s => s !== service);
                opt.style.background = 'var(--bg-secondary)';
                opt.style.color = 'var(--text-primary)';
            } else {
                selectedServices.push(service);
                opt.style.background = 'var(--accent-orange)';
                opt.style.color = 'white';
            }
            nextBtn.textContent = `Continue (${selectedServices.length} selected)`;
        });
    });
    nextBtn.addEventListener('click', () => {
        if (selectedServices.length === 0) {
            showToast('Please select at least one service');
            return;
        }
        onboardingData.services = selectedServices;
        closeBottomSheet();
        showOnboardingStep3();
    });
}

function showOnboardingStep3() {
    openBottomSheet(`
        <h3 style="margin-bottom: 16px;">Where is your workspace?</h3>
        <p style="margin-bottom: 16px; color: var(--text-secondary);">Drop a pin on the map or describe your location</p>
        <div id="onboard-map" style="height: 300px; border-radius: 16px; margin-bottom: 16px; background: var(--bg-secondary);"></div>
        <input type="text" id="onboard-address" placeholder="Describe your address (e.g., beside First Bank, Lagos)" class="search-input" style="margin-bottom: 16px;">
        <button id="onboard-next-3" class="btn-primary" style="width: 100%; padding: 14px; border-radius: 30px;">Continue</button>
    `);
    setTimeout(() => {
        if (window.L && document.getElementById('onboard-map')) {
            const map = L.map('onboard-map').setView([6.5244, 3.3792], 13);
            L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
                attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
            }).addTo(map);
            let marker = null;
            map.on('click', (e) => {
                if (marker) marker.remove();
                marker = L.marker(e.latlng).addTo(map);
                onboardingData.location = { lat: e.latlng.lat, lng: e.latlng.lng };
            });
        }
    }, 100);
    document.getElementById('onboard-next-3').addEventListener('click', () => {
        const address = document.getElementById('onboard-address').value;
        if (!address && !onboardingData.location) {
            showToast('Please set a location on map or enter address');
            return;
        }
        onboardingData.addressText = address;
        closeBottomSheet();
        showOnboardingStep4();
    });
}

function showOnboardingStep4() {
    openBottomSheet(`
        <h3 style="margin-bottom: 16px;">How Credits Work 💰</h3>
        <p style="margin-bottom: 12px;">✅ 1 credit = 1 gig registration</p>
        <p style="margin-bottom: 12px;">✅ Credits deducted ONLY after client reviews you</p>
        <p style="margin-bottom: 12px;">✅ Buy credits: 5 for ₦2500 | 10 for ₦4500 | 20 for ₦8000</p>
        <p style="margin-bottom: 24px;">✅ Without credits, you can still receive messages, just can't register gigs</p>
        <button id="onboard-next-4" class="btn-primary" style="width: 100%; padding: 14px; border-radius: 30px;">Got it! Continue</button>
    `);
    document.getElementById('onboard-next-4').addEventListener('click', () => {
        closeBottomSheet();
        showOnboardingStep5();
    });
}

function showOnboardingStep5() {
    openBottomSheet(`
        <h3 style="margin-bottom: 16px;">Almost done!</h3>
        <p style="margin-bottom: 16px;">Add a profile photo (optional)</p>
        <div style="text-align: center; margin-bottom: 24px;">
            <div id="photo-preview" style="width: 100px; height: 100px; border-radius: 50%; background: var(--bg-secondary); margin: 0 auto; display: flex; align-items: center; justify-content: center; font-size: 40px;">📸</div>
        </div>
        <input type="file" id="profile-photo" accept="image/*" style="margin-bottom: 16px;">
        <textarea id="onboard-bio" placeholder="Tell clients about yourself (optional)" class="search-input" style="margin-bottom: 16px; min-height: 80px;"></textarea>
        <button id="onboard-finish" class="btn-primary" style="width: 100%; padding: 14px; border-radius: 30px;">Complete Setup</button>
    `);
    const fileInput = document.getElementById('profile-photo');
    const preview = document.getElementById('photo-preview');
    fileInput.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                preview.innerHTML = `<img src="${event.target.result}" style="width: 100%; height: 100%; border-radius: 50%; object-fit: cover;">`;
                onboardingData.photoFile = file;
            };
            reader.readAsDataURL(file);
        }
    });
    document.getElementById('onboard-finish').addEventListener('click', async () => {
        onboardingData.bio = document.getElementById('onboard-bio').value;
        closeBottomSheet();
        showToast('Saving your profile...');
        await saveUserProfile();
        navigateToPage('home');
        showToast('Welcome to GigsCourt! 🎉');
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
        credits: 0,
        gigCount: 0,
        rating: 0,
        totalRatingSum: 0,
        createdAt: new Date().toISOString(),
        lastActive: new Date().toISOString()
    }, { merge: true });
    await updateProfile(window.currentUser, { displayName: onboardingData.displayName });
}

// ========== AUTH UI ==========
function showAuthScreen() {
    openBottomSheet(`
        <h3 style="margin-bottom: 16px;">Welcome to GigsCourt</h3>
        <input type="email" id="auth-email" placeholder="Email" class="search-input" style="margin-bottom: 12px;">
        <input type="password" id="auth-password" placeholder="Password" class="search-input" style="margin-bottom: 16px;">
        <button id="auth-login-btn" class="btn-primary" style="width: 100%; padding: 14px; border-radius: 30px; margin-bottom: 12px;">Login</button>
        <button id="auth-signup-btn" class="btn-secondary" style="width: 100%; padding: 14px; border-radius: 30px;">Create Account</button>
    `);
    document.getElementById('auth-login-btn').addEventListener('click', async () => {
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        try {
            const userCred = await signInWithEmailAndPassword(auth, email, password);
            window.currentUser = userCred.user;
            closeBottomSheet();
            showToast('Logged in!');
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
    document.getElementById('auth-signup-btn').addEventListener('click', async () => {
        const email = document.getElementById('auth-email').value;
        const password = document.getElementById('auth-password').value;
        try {
            const userCred = await createUserWithEmailAndPassword(auth, email, password);
            window.currentUser = userCred.user;
            closeBottomSheet();
            showOnboarding();
        } catch (error) {
            showToast(error.message, 'error');
        }
    });
}

// ========== AUTH STATE LISTENER ==========
function setupAuthListener() {
    onAuthStateChanged(auth, async (user) => {
        window.currentUser = user;
        if (user) {
            const userDoc = await getDoc(doc(db, 'users', user.uid));
            if (!userDoc.exists()) {
                showOnboarding();
            } else {
                window.currentUserData = userDoc.data();
                // Hide auth screen if visible and show main app
                closeBottomSheet();
                navigateToPage('home');
            }
        } else {
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
    
    // Setup all core features
    setupBottomSheet();
    setupNavigation();
    setupScrollHandlers();
    setupNotifications();
    setupAuthListener();
    setupProfilePictureHandler();
    
    // Hide splash after delay
    setTimeout(() => {
        if (splashScreen) {
            splashScreen.style.opacity = '0';
            setTimeout(() => {
                splashScreen.style.display = 'none';
                if (mainApp) mainApp.style.display = 'block';
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
