// ========================================
// GigsCourt - Core Module (FIXED - Race Condition)
// Authentication, Navigation, UI, Onboarding.
// ========================================

import { initializeApp } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js';
import { getAuth, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendPasswordResetEmail, sendEmailVerification } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';
import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { getMessaging, getToken, onMessage } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-messaging.js';
import { getFirestore, doc, setDoc, getDoc, updateDoc, collection, addDoc, query, where, getDocs, orderBy, writeBatch, limit, increment, onSnapshot } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// Supabase configuration
const supabaseUrl = 'https://qifzdrkpxzosdturjpex.supabase.co';
const supabaseAnonKey = 'sb_publishable_QfKJ4jT8u_2HuUKmW-xvbQ_9acJvZw-';

// ========== INITIALIZATION ==========
const app = initializeApp(window.firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);

// Initialize FCM
let messaging = null;
if ('Notification' in window && 'serviceWorker' in navigator) {
    messaging = getMessaging(app);
}

// Supabase client (MUST be after auth is defined)
const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => {
        const user = auth.currentUser;
        if (user) {
            return await user.getIdToken(false);
        }
        return null;
    }
});

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
let authStateChecked = false;
let authScreenTimeout = null;

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

// ========== SPLASH SCREEN CONTROL ==========
function showSplashSpinner() {
    const spinner = document.getElementById('splash-spinner');
    if (spinner) {
        spinner.style.display = 'block';
    }
}

function hideSplashScreen() {
    const splashScreen = document.getElementById('splash-screen');
    const mainApp = document.getElementById('main-app');
    
    if (splashScreen) {
        splashScreen.style.opacity = '0';
        splashScreen.style.setProperty('display', 'none', 'important');
    }
    
    if (mainApp) {
        mainApp.style.setProperty('display', 'block', 'important');
        setTimeout(() => {
            mainApp.style.opacity = '1';
        }, 50);
    }
}

// ========== FCM NOTIFICATIONS ==========
async function requestNotificationPermission() {
    if (!messaging) {
        console.log('FCM not supported');
        return null;
    }
    
    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            console.log('Notification permission denied');
            return null;
        }
        
        const vapidKey = 'BAqzckZL6w2k3sX1v6kRso0kTytmC7SYTa8BlUQrOtiasqhhChuD-5G-K1NsarUvWoNmeqab2GgP6kOHUyCQ9XE';
        const token = await getToken(messaging, { vapidKey: vapidKey });
        
        console.log('FCM Token:', token);
        
        if (window.currentUser && token) {
            const { error } = await supabase
                .from('provider_profiles')
                .update({
                    fcm_token: token,
                    fcm_token_updated: new Date().toISOString()
                })
                .eq('user_id', window.currentUser.uid);
            
            if (error) {
                console.error('Failed to save FCM token to Supabase:', error);
            }
        }
        
        return token;
    } catch (error) {
        console.error('Error getting FCM token:', error);
        return null;
    }
}

function setupFCMForegroundListener() {
    if (!messaging) return;
    
    onMessage(messaging, (payload) => {
        console.log('Foreground message:', payload);
        const title = payload.notification?.title || 'GigsCourt';
        const body = payload.notification?.body || '';
        showToast(`${title}: ${body}`, 'info');
    });
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
    
    notificationsBtn.addEventListener('click', async () => {
        notificationsDropdown.classList.toggle('hidden');
        haptic('light');
        
        // Load notifications from Firestore when dropdown opens
        if (notificationsDropdown.classList.contains('hidden') === false) {
            await loadNotificationsFromFirestore();
        }
    });
    
    if (clearNotificationsBtn) {
        clearNotificationsBtn.addEventListener('click', async () => {
            await markAllNotificationsAsRead();
        });
    }
    
    document.addEventListener('click', (e) => {
        if (notificationsBtn && notificationsDropdown && !notificationsBtn.contains(e.target) && !notificationsDropdown.contains(e.target)) {
            notificationsDropdown.classList.add('hidden');
        }
    });
}

async function addNotification(title, body, link = '') {
    // 1. Save to Firestore (persistent)
    if (window.currentUser) {
        try {
            const notificationRef = collection(db, 'users', window.currentUser.uid, 'notifications');
            await addDoc(notificationRef, {
                title: title,
                body: body,
                link: link,
                read: false,
                createdAt: new Date().toISOString(),
                expiresAt: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString()
            });
        } catch (error) {
            console.error('Failed to save notification to Firestore:', error);
        }
    }
    
    // 2. Also show in dropdown (in-memory for immediate display)
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

    // 2.5 Increment stored unread count
    if (window.currentUser) {
        try {
            const metaRef = doc(db, 'user_notification_meta', window.currentUser.uid);
            await updateDoc(metaRef, {
                unreadCount: increment(1)
            }).catch(async (err) => {
                // If document doesn't exist, create it
                if (err.code === 'not-found') {
                    await setDoc(metaRef, { unreadCount: 1 });
                }
            });
        } catch (error) {
            console.error('Failed to update unread count:', error);
        }
    }
    
    // 3. Update badge count
    await updateNotificationBadgeCount();
}

// ========== LOAD NOTIFICATIONS FROM FIRESTORE ==========
async function loadNotificationsFromFirestore() {
    if (!window.currentUser) return;
    
    try {
        const notificationsRef = collection(db, 'users', window.currentUser.uid, 'notifications');
        const q = query(
    notificationsRef,
    orderBy('createdAt', 'desc'),
    limit(50)
);
        const snapshot = await getDocs(q);
        
        // Clear current dropdown
        while (notificationsList.firstChild) {
            notificationsList.removeChild(notificationsList.firstChild);
        }
        
        if (snapshot.empty) {
            notificationsList.innerHTML = '<div class="empty-state">No notifications yet</div>';
            notificationBadge.classList.add('hidden');
            return;
        }
        
        // Add each notification to dropdown
        snapshot.forEach(doc => {
            const notif = doc.data();
            const item = document.createElement('div');
            item.className = 'notification-item';
            item.dataset.notificationId = doc.id;
            item.innerHTML = `
                <div class="notification-title">${notif.title}</div>
                <div class="notification-body">${notif.body}</div>
            `;
            if (notif.link) {
                item.addEventListener('click', () => {
                    markNotificationAsRead(doc.id);
                    window.location.hash = notif.link;
                    closeBottomSheet();
                });
            }
            notificationsList.appendChild(item);
        });
        
        // Update badge count
        await updateNotificationBadgeCount();
        
    } catch (error) {
        console.error('Error loading notifications:', error);
    }
}

// ========== UPDATE NOTIFICATION BADGE COUNT ==========
async function updateNotificationBadgeCount() {
    if (!window.currentUser) return;
    
    try {
        const metaRef = doc(db, 'user_notification_meta', window.currentUser.uid);
        const metaDoc = await getDoc(metaRef);
        const count = metaDoc.exists() ? (metaDoc.data().unreadCount || 0) : 0;
        
        if (count > 0) {
            notificationBadge.textContent = count > 99 ? '99+' : count;
            notificationBadge.classList.remove('hidden');
        } else {
            notificationBadge.classList.add('hidden');
        }
    } catch (error) {
        console.error('Error updating badge count:', error);
    }
}

// ========== MARK NOTIFICATION AS READ ==========
async function markNotificationAsRead(notificationId) {
    if (!window.currentUser) return;
    
    try {
        const notifRef = doc(db, 'users', window.currentUser.uid, 'notifications', notificationId);
        await updateDoc(notifRef, { read: true });
        
        // Decrement stored unread count
        const metaRef = doc(db, 'user_notification_meta', window.currentUser.uid);
        await updateDoc(metaRef, {
            unreadCount: increment(-1)
        }).catch(err => console.error('Failed to decrement unread count:', err));
        
        await updateNotificationBadgeCount();
    } catch (error) {
        console.error('Error marking notification as read:', error);
    }
}

// ========== MARK ALL NOTIFICATIONS AS READ ==========
async function markAllNotificationsAsRead() {
    if (!window.currentUser) return;
    
    try {
        const notificationsRef = collection(db, 'users', window.currentUser.uid, 'notifications');
        const q = query(notificationsRef, where('read', '==', false));
        const snapshot = await getDocs(q);
        
        const batch = writeBatch(db);
        snapshot.forEach(doc => {
            const notifRef = doc(db, 'users', window.currentUser.uid, 'notifications', doc.id);
            batch.update(notifRef, { read: true });
        });
        await batch.commit();

        // Reset stored unread count to 0
        const metaRef = doc(db, 'user_notification_meta', window.currentUser.uid);
        await setDoc(metaRef, { unreadCount: 0 });
        
        await updateNotificationBadgeCount();
        await loadNotificationsFromFirestore();
        
    } catch (error) {
        console.error('Error marking all as read:', error);
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

// ========== FORCE REFRESH HOME FEED AFTER LOGIN ==========
async function forceRefreshHomeFeed() {
    try {
        // Force refresh Firebase token
        if (window.auth?.currentUser) {
            await window.auth.currentUser.getIdToken(true);
            console.log('Token refreshed');
        }
        
        // Wait a moment for Supabase to recognize the new token
        await new Promise(resolve => setTimeout(resolve, 500));
        
        // Reload home feed if function exists
        if (typeof loadHomeFeed === 'function') {
            await loadHomeFeed(true);
            console.log('Home feed refreshed after login');
        }
    } catch (error) {
        console.error('Force refresh home feed error:', error);
    }
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

async function showOnboardingStep2() {
    currentOnboardingStep = 2;
    updateOnboardingStepIndicator(2, 5);
    showOnboardingBackButton(true);
    setOnboardingNextButtonText('Continue');
    
    let selectedServices = [...(onboardingData.services || [])];
    
    // Show loading state
    const content = `
        <h2 class="onboarding-title">What services do you offer?</h2>
        <p class="onboarding-subtitle">Select all that apply</p>
        <div id="onboarding-services-container" style="max-height: 350px; overflow-y: auto;">
            <div class="loading-spinner"></div>
        </div>
        <div class="service-request-section" style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-light);">
            <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Can't find your service?</p>
            <div style="display: flex; gap: 8px;">
                <input type="text" id="custom-service-input" placeholder="Type your service here" class="onboarding-input" style="flex: 1; margin-bottom: 0;">
                <button id="request-service-btn" class="onboarding-btn-secondary" style="padding: 0 16px; white-space: nowrap;">Request</button>
            </div>
            <div id="requested-services-list" style="margin-top: 12px;"></div>
        </div>
    `;
    
    document.getElementById('onboarding-content').innerHTML = content;
    showOnboardingScreen();
    
    // Fetch categories and services from Supabase
    try {
        const { data: categories, error: catError } = await supabase
            .from('service_categories')
            .select('*')
            .order('display_order', { ascending: true });
        
        if (catError) throw catError;
        
        const { data: services, error: servError } = await supabase
            .from('preset_services')
            .select('*')
            .eq('is_active', true);
        
        if (servError) throw servError;
        
        // Group services by category
        const servicesByCategory = {};
        services.forEach(service => {
            if (!servicesByCategory[service.category_id]) {
                servicesByCategory[service.category_id] = [];
            }
            servicesByCategory[service.category_id].push(service);
        });
        
        // Build HTML
        let html = '';
        categories.forEach(category => {
            const categoryServices = servicesByCategory[category.id] || [];
            if (categoryServices.length === 0) return;
            
            html += `
                <div class="onboarding-category" style="margin-bottom: 16px; border-bottom: 1px solid var(--border-light); padding-bottom: 8px;">
                    <div class="category-header" data-category-id="${category.id}" style="display: flex; align-items: center; gap: 8px; padding: 8px 0; cursor: pointer; font-weight: 600;">
                        <span class="category-arrow" id="arrow-${category.id}" style="font-size: 12px; transition: transform 0.2s;">▶</span>
                        <span>${category.emoji} ${category.category_name}</span>
                        <span style="margin-left: auto; font-size: 12px; color: var(--text-secondary);">${categoryServices.length}</span>
                    </div>
                    <div class="category-services" id="category-${category.id}" style="display: none; padding-left: 24px; padding-bottom: 8px;">
            `;
            
            categoryServices.forEach(service => {
                const isSelected = selectedServices.includes(service.service_name);
                html += `
                    <div class="onboarding-service-option ${isSelected ? 'selected' : ''}" data-service="${service.service_name}" style="padding: 10px 12px; margin-bottom: 4px; background: ${isSelected ? 'var(--accent-orange)' : 'var(--bg-secondary)'}; color: ${isSelected ? 'white' : 'var(--text-primary)'}; border-radius: 8px; cursor: pointer;">
                        ${service.display_name}
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        });
        
        document.getElementById('onboarding-services-container').innerHTML = html || '<p style="color: var(--text-secondary); text-align: center;">No services available</p>';
        
        // Add category toggle handlers
        document.querySelectorAll('.category-header').forEach(header => {
            header.addEventListener('click', () => {
                const categoryId = header.dataset.categoryId;
                const servicesDiv = document.getElementById(`category-${categoryId}`);
                const arrow = document.getElementById(`arrow-${categoryId}`);
                
                if (servicesDiv.style.display === 'none') {
                    servicesDiv.style.display = 'block';
                    arrow.style.transform = 'rotate(90deg)';
                } else {
                    servicesDiv.style.display = 'none';
                    arrow.style.transform = 'rotate(0deg)';
                }
            });
        });
        
        // Add service selection handlers
        document.querySelectorAll('.onboarding-service-option').forEach(opt => {
            opt.addEventListener('click', () => {
                const service = opt.dataset.service;
                if (selectedServices.includes(service)) {
                    selectedServices = selectedServices.filter(s => s !== service);
                    opt.classList.remove('selected');
                    opt.style.background = 'var(--bg-secondary)';
                    opt.style.color = 'var(--text-primary)';
                } else {
                    selectedServices.push(service);
                    opt.classList.add('selected');
                    opt.style.background = 'var(--accent-orange)';
                    opt.style.color = 'white';
                }
            });
        });
        
    } catch (error) {
        console.error('Error fetching services:', error);
        document.getElementById('onboarding-services-container').innerHTML = '<p style="color: var(--error-red); text-align: center;">Error loading services. Please try again.</p>';
    }
    
    // ========== SERVICE REQUEST HANDLER ==========
    let requestedServices = [...(onboardingData.requestedServices || [])];
    
    // Update requested services display
    function updateRequestedDisplay() {
        const listDiv = document.getElementById('requested-services-list');
        if (requestedServices.length > 0) {
            listDiv.innerHTML = requestedServices.map(s => `
                <span style="display: inline-block; background: var(--bg-tertiary); padding: 4px 12px; border-radius: 20px; font-size: 12px; margin-right: 8px; margin-bottom: 8px;">⏳ ${s} (Pending)</span>
            `).join('');
        } else {
            listDiv.innerHTML = '';
        }
    }
    updateRequestedDisplay();
    
    document.getElementById('request-service-btn')?.addEventListener('click', () => {
        const input = document.getElementById('custom-service-input');
        const serviceName = input.value.trim();
        
        if (!serviceName) {
            showToast('Please enter a service name', 'error');
            return;
        }
        
        if (requestedServices.includes(serviceName)) {
            showToast('You already requested this service', 'error');
            return;
        }
        
        requestedServices.push(serviceName);
        onboardingData.requestedServices = requestedServices;
        updateRequestedDisplay();
        input.value = '';
        showToast('Service requested! Admin will review.', 'success');
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
        // PREVENT DOUBLE CLICKS
        oldNext.disabled = true;
        oldNext.textContent = 'Creating account...';
        oldNext.style.opacity = '0.7';
        oldNext.style.cursor = 'not-allowed';
        
        onboardingData.bio = document.getElementById('onboard-bio').value;
        
        // Upload photo if exists
        if (onboardingData.photoFile) {
            // Show uploading message (we'll create a simple status display)
            const statusDiv = document.createElement('div');
            statusDiv.id = 'onboarding-status';
            statusDiv.style.cssText = 'text-align: center; margin-top: 16px; color: var(--text-secondary); font-size: 14px;';
            statusDiv.textContent = '📸 Uploading photo...';
            document.getElementById('onboarding-content').appendChild(statusDiv);
            
            try {
                const photoURL = await uploadImage(onboardingData.photoFile, 'profiles');
                onboardingData.photoURL = photoURL;
                statusDiv.textContent = '✅ Photo uploaded!';
            } catch (error) {
                console.error('Photo upload error:', error);
                statusDiv.textContent = '⚠️ Photo upload failed. You can add it later in your profile.';
                // Continue anyway - don't block account creation
            }
        }
        
        // Update or create status
        let statusDiv = document.getElementById('onboarding-status');
        if (!statusDiv) {
            statusDiv = document.createElement('div');
            statusDiv.id = 'onboarding-status';
            statusDiv.style.cssText = 'text-align: center; margin-top: 16px; color: var(--text-secondary); font-size: 14px;';
            document.getElementById('onboarding-content').appendChild(statusDiv);
        }
        statusDiv.textContent = '💾 Saving your profile...';
        
        try {
            await saveUserProfile();
            hideOnboardingScreen();
            navigateToPage('home');
            showToast('Welcome to GigsCourt! 🎉');
            
            // Force refresh token and reload home feed
            setTimeout(() => {
                forceRefreshHomeFeed();
            }, 500);
        } catch (error) {
            console.error('Save profile error:', error);
            // Re-enable button on error so user can try again
            oldNext.disabled = false;
            oldNext.textContent = 'Complete Setup';
            oldNext.style.opacity = '1';
            oldNext.style.cursor = 'pointer';
            
            if (statusDiv) {
                statusDiv.textContent = '❌ Error saving profile. Please try again.';
                statusDiv.style.color = 'var(--error-red)';
            }
        }
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
    
    const userId = window.currentUser.uid;
    const servicesList = (onboardingData.services || []).join(', ');
    const portfolio = onboardingData.portfolio || [];
    
    // 1. Save to Supabase provider_profiles
    try {
        const { error: profileError } = await supabase
            .from('provider_profiles')
            .upsert({
                user_id: userId,
                email: window.currentUser.email,
                display_name: onboardingData.displayName || 'User',
                phone: onboardingData.phone || '',
                bio: onboardingData.bio || '',
                address_text: onboardingData.addressText || '',
                services: servicesList,
                photo_url: onboardingData.photoURL || null,
                portfolio: portfolio,
                credits: 5,
                gig_count: 0,
                rating: 0,
                total_rating_sum: 0,
                created_at: new Date().toISOString(),
                last_active: new Date().toISOString()
            }, { onConflict: 'user_id' });
        
        if (profileError) {
            console.error('Supabase profile save error:', profileError);
            throw profileError;
        }
        console.log('Supabase profile saved for user:', userId);
    } catch (err) {
        console.error('Failed to save profile to Supabase:', err);
        throw err;
    }
    
    // 2. Save to Supabase provider_locations (if location exists)
    if (onboardingData.location && onboardingData.location.lat && onboardingData.location.lng) {
        try {
            const { error: locationError } = await supabase
                .from('provider_locations')
                .upsert({
                    user_id: userId,
                    lat: onboardingData.location.lat,
                    lng: onboardingData.location.lng,
                    location: `POINT(${onboardingData.location.lng} ${onboardingData.location.lat})`,
                    services: servicesList,
                    rating: 0,
                    gig_count: 0,
                    last_gig_date: null,
                }, { onConflict: 'user_id' });
            
            if (locationError) {
                console.error('Supabase location sync error:', locationError);
            } else {
                console.log('Supabase location synced for user:', userId);
            }
        } catch (err) {
            console.error('Failed to sync location to Supabase:', err);
        }
    } else {
        console.warn('No location data available, skipping Supabase location sync.');
    }
    
    // 3. Update Firebase Auth profile
    const updateData = { displayName: onboardingData.displayName };
    if (onboardingData.photoURL) {
        updateData.photoURL = onboardingData.photoURL;
    }
    await updateProfile(window.currentUser, updateData);

    // 3.5 Save any requested services
    if (onboardingData.requestedServices && onboardingData.requestedServices.length > 0) {
        const userEmail = window.currentUser.email;
        for (const serviceName of onboardingData.requestedServices) {
            try {
                const { error: requestError } = await supabase
                    .from('service_requests')
                    .insert({
                        user_id: userId,
                        user_email: userEmail,
                        requested_service: serviceName,
                        status: 'pending'
                    });
                
                if (requestError) {
                    console.error('Failed to save service request:', requestError);
                } else {
                    console.log('Service request saved:', serviceName);
                }
            } catch (err) {
                console.error('Error saving service request:', err);
            }
        }
    }
    
    // 4. Set current user data in memory
    window.currentUserData = {
        displayName: onboardingData.displayName || 'User',
        phone: onboardingData.phone || '',
        bio: onboardingData.bio || '',
        addressText: onboardingData.addressText || '',
        services: onboardingData.services || [],
        photoURL: onboardingData.photoURL || null,
        portfolio: portfolio,
        credits: 5,
        gigCount: 0,
        rating: 0
    };
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
async function setupAuthListener() {
    // Wait for Firebase to settle initial auth state
    await auth.authStateReady();
    
    // Get the final current user after auth state is settled
    const user = auth.currentUser;
    window.currentUser = user;
    
    if (user) {
        // FORCE HIDE SPLASH SCREEN IMMEDIATELY - DIRECT DOM MANIPULATION
        const splash = document.getElementById('splash-screen');
        const main = document.getElementById('main-app');
        if (splash) splash.style.setProperty('display', 'none', 'important');
        if (main) {
            main.style.setProperty('display', 'block', 'important');
            main.style.opacity = '1';
        }
        
        // Hide auth screen
        hideAuthScreen();
        
        try {
            // Fetch user profile from Supabase instead of Firestore
            const { data: profile, error } = await supabase
                .from('provider_profiles')
                .select('*')
                .eq('user_id', user.uid)
                .single();
            
            if (profile && !error) {
                // Convert Supabase profile to the format expected by the app
                window.currentUserData = {
                    displayName: profile.display_name || 'User',
                    phone: profile.phone || '',
                    bio: profile.bio || '',
                    addressText: profile.address_text || '',
                    services: profile.services ? profile.services.split(',').map(s => s.trim()) : [],
                    photoURL: profile.photo_url || null,
                    portfolio: profile.portfolio || [],
                    credits: profile.credits || 0,
                    gigCount: profile.gig_count || 0,
                    rating: profile.rating || 0,
                    totalRatingSum: profile.total_rating_sum || 0,
                    reviewCount: profile.review_count || 0,
                    fcmToken: profile.fcm_token || null
                };

                // Backfill email for existing users who don't have it yet
                if (!profile.email && user.email) {
                    supabase
                        .from('provider_profiles')
                        .update({ email: user.email })
                        .eq('user_id', user.uid)
                        .then(() => console.log('Email backfilled for user:', user.email))
                        .catch(err => console.error('Email backfill error:', err));
                }

                // ========== REAL-TIME NOTIFICATION BADGE LISTENER ==========
                const metaRef = doc(db, 'user_notification_meta', user.uid);
                onSnapshot(metaRef, (doc) => {
                    const count = doc.exists() ? (doc.data().unreadCount || 0) : 0;
                    if (count > 0) {
                        notificationBadge.textContent = count > 99 ? '99+' : count;
                        notificationBadge.classList.remove('hidden');
                    } else {
                        notificationBadge.classList.add('hidden');
                    }
                }, (error) => {
                    console.error('Badge listener error:', error);
                });
                
                navigateToPage('home');
                
                // Show a loading spinner immediately so user isn't staring at blank screen
                const homeFeed = document.getElementById('home-feed');
                if (homeFeed) {
                    homeFeed.innerHTML = '<div class="loading-spinner"></div>';
                }

                loadNotificationsFromFirestore();

                // Show admin tab if user is admin
                setTimeout(() => {
                    const adminTab = document.getElementById('admin-tab');
                    const adminEmail = 'theprimestarventures@gmail.com';
                    if (window.currentUser && window.currentUser.email === adminEmail && adminTab) {
                        adminTab.classList.remove('hidden');
                    }
                }, 500);
                
                setTimeout(() => {
                    requestNotificationPermission();
                    setupFCMForegroundListener();
                }, 2000);
                
                // Wait for token refresh, THEN fire appReady so features load once with proper auth
                setTimeout(async () => {
                    await forceRefreshHomeFeed();
                    
                    // Now fire appReady so other features can initialize
                    if (!appReadyFired) {
                        appReadyFired = true;
                        window.dispatchEvent(new CustomEvent('appReady'));
                    }
                }, 500);

            } else {
                // No profile found - user needs to complete onboarding
                hideAuthScreen();
                if (!appReadyFired) {
                    appReadyFired = true;
                    window.dispatchEvent(new CustomEvent('appReady'));
                }
                
                if (user.emailVerified) {
                    showOnboarding();
                } else {
                    showVerificationRequiredScreen();
                }
            }
        } catch (error) {
            console.error('Error loading user data:', error);
            
            // Only show toast for actual errors (not just "no profile yet")
            // Supabase returns a specific error when no rows found
            const isNoProfileError = error && (
                error.code === 'PGRST116' || 
                error.message?.includes('JSON object requested') ||
                error.message?.includes('contains 0 rows')
            );
            
            if (!isNoProfileError) {
                showToast('Error loading profile. Please refresh.', 'error');
            }
            
            // Always fire appReady so the app can continue
            if (!appReadyFired) {
                appReadyFired = true;
                window.dispatchEvent(new CustomEvent('appReady'));
            }
            
            // For new users with no profile, trigger onboarding
            if (isNoProfileError && user) {
                if (user.emailVerified) {
                    showOnboarding();
                } else {
                    showVerificationRequiredScreen();
                }
            }
        }
        
        // SAFETY NET - Ensure splash is hidden after everything
        setTimeout(() => {
            const splashCheck = document.getElementById('splash-screen');
            if (splashCheck && window.getComputedStyle(splashCheck).display !== 'none') {
                splashCheck.style.setProperty('display', 'none', 'important');
                const mainCheck = document.getElementById('main-app');
                if (mainCheck) mainCheck.style.setProperty('display', 'block', 'important');
            }
        }, 1000);
        
    } else {
        // No user found - show spinner first
        showSplashSpinner();
        
        // Give a short delay to ensure no user appears (handles edge cases)
        authScreenTimeout = setTimeout(() => {
            showAuthScreen();
            const splash = document.getElementById('splash-screen');
            const main = document.getElementById('main-app');
            if (splash) splash.style.setProperty('display', 'none', 'important');
            if (main) main.style.setProperty('display', 'block', 'important');
            authScreenTimeout = null;
        }, 1500);
    }
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
window.hideSplashScreen = hideSplashScreen;  

// Force appReady after a short delay to ensure everything is loaded
setTimeout(() => {
    if (!appReadyFired && window.db && window.auth) {
        appReadyFired = true;
        window.dispatchEvent(new CustomEvent('appReady'));
    }
}, 1000);
