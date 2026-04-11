// ========================================
// GigsCourt - Features Module (FIXED - Modular Firestore Syntax)
// Map, Chat, Gigs, Credits, Reviews, Profile, Portfolio, Uploads
// ========================================

import { 
    increment, 
    collection, 
    query, 
    where, 
    getDocs, 
    getDoc, 
    setDoc, 
    updateDoc, 
    addDoc, 
    orderBy, 
    onSnapshot, 
    doc, 
    deleteDoc, 
    limit,
    startAfter
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

const supabaseUrl = 'https://qifzdrkpxzosdturjpex.supabase.co';
const supabaseAnonKey = 'sb_publishable_QfKJ4jT8u_2HuUKmW-xvbQ_9acJvZw-';

const supabase = createClient(supabaseUrl, supabaseAnonKey, {
    accessToken: async () => {
        const auth = getAuth();
        const user = auth.currentUser;
        if (user) {
            return await user.getIdToken(false);
        }
        return null;
    }
});

// ========== SUPABASE HELPER FUNCTIONS ==========
async function fetchProviderProfilesFromSupabase(userIds) {
    if (!userIds || userIds.length === 0) return {};
    
    try {
        const { data: profiles, error } = await supabase
            .from('provider_profiles')
            .select('*')
            .in('user_id', userIds);
        
        if (error) throw error;
        
        const profilesMap = {};
        profiles.forEach(profile => {
            profilesMap[profile.user_id] = {
                displayName: profile.display_name,
                photoURL: profile.photo_url,
                bio: profile.bio,
                phone: profile.phone,
                addressText: profile.address_text,
                services: profile.services ? profile.services.split(',').map(s => s.trim()) : [],
                portfolio: profile.portfolio || [],
                credits: profile.credits || 0,
                gigCount: profile.gig_count || 0,
                rating: profile.rating || 0,
                reviewCount: profile.review_count || 0
            };
        });
        return profilesMap;
    } catch (error) {
        console.error('fetchProviderProfilesFromSupabase error:', error);
        return {};
    }
}

async function getSingleProfileFromSupabase(userId) {
    try {
        const { data: profile, error } = await supabase
            .from('provider_profiles')
            .select('*')
            .eq('user_id', userId)
            .single();
        
        if (error || !profile) return null;
        
        return {
            id: profile.user_id,
            displayName: profile.display_name,
            photoURL: profile.photo_url,
            bio: profile.bio,
            phone: profile.phone,
            addressText: profile.address_text,
            services: profile.services ? profile.services.split(',').map(s => s.trim()) : [],
            portfolio: profile.portfolio || [],
            credits: profile.credits || 0,
            gigCount: profile.gig_count || 0,
            rating: profile.rating || 0,
            totalRatingSum: profile.total_rating_sum || 0,
            reviewCount: profile.review_count || 0
        };
    } catch (error) {
        console.error('getSingleProfileFromSupabase error:', error);
        return null;
    }
}

// ========== ROLLING 30-DAY GIG COUNT ==========
async function getRolling30DayGigCount(userId) {
    if (!userId) return 0;
    
    try {
        const thirtyDaysAgo = new Date();
        thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
        
        const { count, error } = await supabase
            .from('gigs')
            .select('*', { count: 'exact', head: true })
            .eq('provider_id', userId)
            .eq('status', 'completed')
            .gte('completed_at', thirtyDaysAgo.toISOString());
        
        if (error) {
            console.error('getRolling30DayGigCount error:', error);
            return 0;
        }
        
        return count || 0;
    } catch (error) {
        console.error('getRolling30DayGigCount error:', error);
        return 0;
    }
}

// ========== DOM ELEMENTS ==========
let homeFeed, searchServiceInput, radiusSlider, radiusValue, mapViewBtn, listViewBtn, mapContainer, searchListView, searchListFeed, chatsList, profileContent;

// ========== STATE ==========
let currentMap = null;
let currentMarkers = [];
let currentListViewData = [];
let currentChatUser = null;
let currentChatId = null;
let currentMessagesUnsubscribe = null;
let lastVisibleMessage = null;
let isLoadingMoreMessages = false;
let hasMoreMessages = true;
const MESSAGES_PER_PAGE = 30;
let currentUserLocation = null;
let currentRadius = 1;
let currentSearchService = '';
let currentViewMode = 'map';
let featuresInitialized = false;
// Supabase home feed pagination
let homeFeedOffset = 0;
let isHomeFeedLoading = false;
let hasMoreHomeFeed = true;
const HOME_FEED_LIMIT = 20;
let chatListUnsubscribe = null;
let globalUnreadListener = null;
// Supabase search pagination
let searchOffset = 0;
let isSearchLoading = false;
let hasMoreSearch = true;
const SEARCH_LIMIT = 20;

// ========== PULL TO REFRESH STATE ==========
let pullToRefreshState = {
    // Home page
    home: {
        enabled: false,
        startY: 0,
        currentY: 0,
        pullDistance: 0,
        isPulling: false,
        isRefreshing: false,
        startedAtTop: false,
        threshold: 60,
        maxPull: 60,
        indicator: null,
        textEl: null,
        spinnerEl: null,
        container: null
    },
    // Profile page
    profile: {
        enabled: false,
        startY: 0,
        currentY: 0,
        pullDistance: 0,
        isPulling: false,
        isRefreshing: false,
        startedAtTop: false,
        threshold: 60,
        maxPull: 60,
        indicator: null,
        textEl: null,
        spinnerEl: null,
        container: null
    }
};

// ========== SEND PUSH NOTIFICATION ==========
async function sendPushNotification(userId, title, body, clickAction = '/') {
    if (!userId) return;
    
    try {
        const response = await fetch('/api/send-notification', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                userId: userId,
                title: title,
                body: body,
                clickAction: clickAction
            })
        });
        
        const result = await response.json();
        console.log('Notification sent:', result);
    } catch (error) {
        console.error('Failed to send notification:', error);
    }
}

// ========== IMAGEKIT CONFIG ==========
const IMAGEKIT_URL = 'https://ik.imagekit.io/Theprimestar';
const IMAGEKIT_PUBLIC_KEY = 'public_hwM9hldZI+DqFY/pncPQCA5VRWo=';

// ========== PAYSTACK CONFIG ==========
const PAYSTACK_PUBLIC_KEY = 'pk_test_4f6ae42964ab8da60e2f1c77cfb6fe1cd30806cc';

// ========== HELPER FUNCTIONS ==========
function formatDistance(meters) {
    if (meters < 1000) return `${Math.round(meters)}m away`;
    return `${(meters / 1000).toFixed(1)}km away`;
}

function getActiveStatus(userData) {
    const lastGigDate = userData.lastGigDate ? new Date(userData.lastGigDate) : null;
    const now = new Date();
    const sevenDaysAgo = new Date(now.setDate(now.getDate() - 7));
    if (lastGigDate && lastGigDate > sevenDaysAgo) {
        return { active: true, text: 'Active this week' };
    }
    return { active: false, text: 'Inactive' };
}

// ========== IMAGE OPTIMIZATION HELPER ==========
function getOptimizedImageUrl(url, width = 100, height = 100, fullSize = false) {
    if (!url) return url;
    
    if (url.includes('ui-avatars.com')) return url;
    
    // Add cache-control for 1 year (31536000 seconds)
    const cacheParam = 'cache-control=public,max-age=31536000';
    
    if (fullSize) {
        return `${url}?tr=f-webp,${cacheParam}`;
    }
    
    return `${url}?tr=f-webp,w-${width},h-${height},c-at_max,${cacheParam}`;
}

function calculateDistance(lat1, lon1, lat2, lon2) {
    const R = 6371e3;
    const φ1 = lat1 * Math.PI/180;
    const φ2 = lat2 * Math.PI/180;
    const Δφ = (lat2-lat1) * Math.PI/180;
    const Δλ = (lon2-lon1) * Math.PI/180;
    const a = Math.sin(Δφ/2) * Math.sin(Δφ/2) + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ/2) * Math.sin(Δλ/2);
    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
    return R * c;
}

// Helper: Convert radius (km) to Leaflet zoom level
function getZoomLevelFromRadius(radiusKm) {
    if (radiusKm <= 1) return 14;
    if (radiusKm <= 2) return 13;
    if (radiusKm <= 5) return 12;
    if (radiusKm <= 10) return 11;
    if (radiusKm <= 20) return 10;
    return 9;
}

// ========== IMAGE UPLOAD (ImageKit with Authentication) ==========
async function getImageKitAuthParams() {
    try {
        const response = await fetch('/api/imagekit-auth');
        if (!response.ok) {
            throw new Error('Failed to get authentication parameters');
        }
        const data = await response.json();
        return data;
    } catch (error) {
        console.error('Auth error:', error);
        throw error;
    }
}

async function uploadImage(file, folder = 'profiles') {
    try {
        // Get authentication parameters from your backend
        const authParams = await getImageKitAuthParams();
        
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fileName', `${Date.now()}_${file.name}`);
        formData.append('folder', `/GigsCourt/${folder}`);
        formData.append('useUniqueFileName', 'true');
        
        // Add authentication parameters (including publicKey)
        formData.append('publicKey', authParams.publicKey);
        formData.append('signature', authParams.signature);
        formData.append('token', authParams.token);
        formData.append('expire', authParams.expire);
        
        // Add timeout to prevent hanging
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 30000); // 30 second timeout
        
        const response = await fetch(`https://upload.imagekit.io/api/v1/files/upload`, {
            method: 'POST',
            body: formData,
            signal: controller.signal
        });
        
        clearTimeout(timeoutId);
        
        if (!response.ok) {
            throw new Error(`Upload failed with status ${response.status}`);
        }
        
        const data = await response.json();
        
        if (data.url) {
            return data.url;
        } else {
            console.error('Upload error:', data);
            throw new Error(data.message || 'Upload failed - no URL returned');
        }
    } catch (error) {
        console.error('uploadImage error:', error);
        // Don't throw during onboarding - return null instead
        // This allows account creation to continue without photo
        if (error.name === 'AbortError') {
            console.error('Upload timed out after 30 seconds');
        }
        return null;
    }
}


// ========== HOME PAGE (Supabase - Infinite Scroll) ==========
async function loadHomeFeed(reset = false, skipSpinner = false) {
    if (!homeFeed) return;
    
    if (!window.auth?.currentUser) {
        homeFeed.innerHTML = '<div class="loading-spinner"></div>';
        let attempts = 0;
        const maxAttempts = 50;
        
        while (!window.auth?.currentUser && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        if (!window.auth?.currentUser) {
            homeFeed.innerHTML = '<div class="empty-state">Please log in to see providers</div>';
            return;
        }
        homeFeed.innerHTML = '<div class="loading-spinner"></div>';
    }
    
    if (reset) {
        if (!skipSpinner) {
            homeFeed.innerHTML = '<div class="loading-spinner"></div>';
        }
        homeFeedOffset = 0;
        hasMoreHomeFeed = true;
        while (homeFeed.firstChild) {
            homeFeed.removeChild(homeFeed.firstChild);
        }
    }
    
    if (isHomeFeedLoading || !hasMoreHomeFeed) return;
    isHomeFeedLoading = true;
    
    try {
        if (!currentUserLocation) {
            const location = await new Promise((resolve) => {
                if (!navigator.geolocation) {
                    resolve({ lat: 6.5244, lng: 3.3792 });
                    return;
                }
                navigator.geolocation.getCurrentPosition(
                    (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
                    () => resolve({ lat: 6.5244, lng: 3.3792 })
                );
            });
            currentUserLocation = location;
        }
        
        // SINGLE QUERY - No N+1!
        const { data: providers, error } = await supabase.rpc('get_home_feed_providers', {
            p_current_lat: currentUserLocation.lat,
            p_current_lng: currentUserLocation.lng,
            p_limit: HOME_FEED_LIMIT,
            p_offset: homeFeedOffset
        });
        
        if (error) throw error;
        
        if (!providers || providers.length === 0) {
            hasMoreHomeFeed = false;
            if (homeFeed.children.length === 0 || (homeFeed.children.length === 1 && homeFeed.querySelector('.loading-spinner'))) {
                const spinner = homeFeed.querySelector('.loading-spinner');
                if (spinner) spinner.remove();
                homeFeed.insertAdjacentHTML('beforeend', '<div class="empty-state">No providers found nearby</div>');
            }
            isHomeFeedLoading = false;
            return;
        }
        
        homeFeedOffset += providers.length;
        if (providers.length < HOME_FEED_LIMIT) hasMoreHomeFeed = false;
        
        // Build cards - NO MORE N+1 QUERIES!
        const cardsHtml = providers.map(provider => {
            const servicesList = provider.services ? provider.services.split(',').map(s => s.trim()) : [];
            const activeStatus = provider.last_gig_date && new Date(provider.last_gig_date) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            
            return `
            <div class="card" data-user-id="${provider.user_id}">
                <div class="card-header">
                    <img class="card-avatar" src="${getOptimizedImageUrl(provider.photo_url, 100, 100) || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(provider.display_name)}" alt="${provider.display_name}" loading="lazy">
                    <div class="card-info">
                        <div class="card-name">
                            ${provider.display_name}
                            ${activeStatus ? '<span class="active-badge">Active</span>' : ''}
                        </div>
                        <div class="card-rating">
                            <span class="star">★</span> ${(provider.rating || 0).toFixed(1)} (${provider.review_count || 0})
                        </div>
                    </div>
                </div>
                <div class="card-services">
                    ${servicesList.slice(0, 3).map(s => `<span class="service-tag">${s}</span>`).join('')}
                </div>
                <div class="card-stats">
                    <div class="stat-item">📊 ${provider.gig_count || 0} gigs total</div>
                    <div class="stat-item">🔥 ${provider.monthly_gigs || 0} gigs this month</div>
                </div>
                <div class="card-distance">📍 ${formatDistance(provider.distance_meters)}</div>
            </div>
        `;
        }).join('');
        
        if (reset) {
            homeFeed.insertAdjacentHTML('beforeend', cardsHtml);
            const spinner = homeFeed.querySelector('.loading-spinner');
            if (spinner) spinner.remove();
        } else {
            homeFeed.insertAdjacentHTML('beforeend', cardsHtml);
        }
        
        document.querySelectorAll('#home-feed .card:not([data-listener])').forEach(card => {
            card.setAttribute('data-listener', 'true');
            card.addEventListener('click', () => {
                window.haptic('light');
                showUserBottomSheet(card.dataset.userId);
            });
        });
        
    } catch (error) {
        console.error('loadHomeFeed error:', error);
        if (homeFeed.children.length === 0 || (homeFeed.children.length === 1 && homeFeed.querySelector('.loading-spinner'))) {
            const spinner = homeFeed.querySelector('.loading-spinner');
            if (spinner) spinner.remove();
            homeFeed.insertAdjacentHTML('beforeend', '<div class="empty-state">Error loading feed. Pull to refresh.</div>');
        }
    } finally {
        isHomeFeedLoading = false;
    }
}

// ========== INFINITE SCROLL ==========
function setupInfiniteScroll() {
    const homePage = document.getElementById('home-page');
    if (!homePage) return;
    
    homePage.addEventListener('scroll', () => {
        const scrollTop = homePage.scrollTop;
        const scrollHeight = homePage.scrollHeight;
        const clientHeight = homePage.clientHeight;
        
        // Load more when 200px from bottom
        if (scrollTop + clientHeight >= scrollHeight - 200) {
            if (!isHomeFeedLoading && hasMoreHomeFeed) {
                loadHomeFeed(false);
            }
        }
    });
}

// ========== PULL TO REFRESH ==========
function setupPullToRefresh() {
    // Setup for Home page
    const homePage = document.getElementById('home-page');
    const homeIndicator = document.getElementById('home-pull-indicator');
    if (homePage && homeIndicator) {
        pullToRefreshState.home.indicator = homeIndicator;
        pullToRefreshState.home.textEl = homeIndicator.querySelector('.pull-text');
        pullToRefreshState.home.spinnerEl = homeIndicator.querySelector('.pull-spinner');
        pullToRefreshState.home.container = homePage;
        pullToRefreshState.home.enabled = true;
        
        // Touch events for home page
        homePage.addEventListener('touchstart', (e) => handleTouchStart(e, 'home'), { passive: false });
        homePage.addEventListener('touchmove', (e) => handleTouchMove(e, 'home'), { passive: false });
        homePage.addEventListener('touchend', (e) => handleTouchEnd(e, 'home'));
    }
    
    // Setup for Profile page
    const profilePage = document.getElementById('profile-page');
    const profileIndicator = document.getElementById('profile-pull-indicator');
    if (profilePage && profileIndicator) {
        pullToRefreshState.profile.indicator = profileIndicator;
        pullToRefreshState.profile.textEl = profileIndicator.querySelector('.pull-text');
        pullToRefreshState.profile.spinnerEl = profileIndicator.querySelector('.pull-spinner');
        pullToRefreshState.profile.container = profilePage;
        pullToRefreshState.profile.enabled = true;
        
        // Touch events for profile page
        profilePage.addEventListener('touchstart', (e) => handleTouchStart(e, 'profile'), { passive: false });
        profilePage.addEventListener('touchmove', (e) => handleTouchMove(e, 'profile'), { passive: false });
        profilePage.addEventListener('touchend', (e) => handleTouchEnd(e, 'profile'));
    }
}

function handleTouchStart(e, page) {
    const state = pullToRefreshState[page];
    if (!state.enabled || state.isRefreshing) return;
    
    const container = state.container;
    
    // Record whether we started at the top (allowing 1px margin)
    state.startedAtTop = (container.scrollTop <= 1);
    
    // Only track if we actually started at the top
    if (!state.startedAtTop) return;
    
    state.startY = e.touches[0].clientY;
    state.isPulling = false;
}

function handleTouchMove(e, page) {
    const state = pullToRefreshState[page];
    if (!state.enabled || state.isRefreshing) return;
    
    // CRITICAL: Only allow pull-to-refresh if we STARTED at the top
    if (!state.startedAtTop) {
        state.isPulling = false;
        return;
    }
    
    const container = state.container;
    
    // Double-check we're still at or above the top
    if (container.scrollTop > 1) {
        state.isPulling = false;
        state.startedAtTop = false;
        return;
    }
    
    const currentY = e.touches[0].clientY;
    const deltaY = currentY - state.startY;
    
    // If pulling UP or not moving, do nothing
    if (deltaY <= 0) {
        state.isPulling = false;
        return;
    }
    
    // Only prevent default after a deliberate pull (20px)
    if (deltaY > 20) {
        e.preventDefault();
    }
    
    // Only show indicator after an even larger threshold (35px)
    if (deltaY > 35) {
        state.isPulling = true;
        state.currentY = currentY;
        
        // STIFFER: Apply stronger resistance (0.2)
        let pullDistance = deltaY * 0.2;
        if (pullDistance > state.maxPull) {
            pullDistance = state.maxPull;
        }
        state.pullDistance = pullDistance;
        
        // Update indicator
        updatePullIndicator(page, pullDistance, state.threshold);
    }
}

function handleTouchEnd(e, page) {
    const state = pullToRefreshState[page];
    if (!state.enabled || !state.isPulling || state.isRefreshing) return;
    
    if (state.pullDistance >= state.threshold) {
        // Trigger refresh
        triggerRefresh(page);
    } else {
        // Reset
        resetPullIndicator(page);
    }
    
    state.isPulling = false;
    state.pullDistance = 0;
}

function updatePullIndicator(page, distance, threshold) {
    const state = pullToRefreshState[page];
    const indicator = state.indicator;
    const textEl = state.textEl;
    
    if (!indicator || !textEl) return;
    
    // Set height and opacity
    indicator.style.height = distance + 'px';
    indicator.style.opacity = Math.min(distance / threshold, 1);
    indicator.classList.add('visible');
    
    if (distance >= threshold) {
        indicator.classList.add('release');
        textEl.textContent = 'Release to refresh';
        indicator.setAttribute('data-state', 'release');
        
        // Haptic feedback on threshold cross (only once)
        if (!indicator.dataset.thresholdReached) {
            window.haptic('light');
            indicator.dataset.thresholdReached = 'true';
        }
    } else {
        indicator.classList.remove('release');
        textEl.textContent = 'Pull to refresh';
        indicator.setAttribute('data-state', 'pulling');
        delete indicator.dataset.thresholdReached;
    }
}

function resetPullIndicator(page) {
    const state = pullToRefreshState[page];
    const indicator = state.indicator;
    
    if (!indicator) return;
    
    indicator.style.height = '0';
    indicator.style.opacity = '0';
    indicator.classList.remove('visible', 'release', 'refreshing');
    indicator.setAttribute('data-state', '');
    delete indicator.dataset.thresholdReached;
    
    if (state.textEl) {
        state.textEl.textContent = 'Pull to refresh';
    }
}

async function triggerRefresh(page) {
    const state = pullToRefreshState[page];
    const indicator = state.indicator;
    const textEl = state.textEl;
    
    if (!indicator || state.isRefreshing) return;
    
    state.isRefreshing = true;
    indicator.classList.add('refreshing');
    indicator.classList.remove('release');
    indicator.style.height = '60px';
    indicator.style.opacity = '1';
    textEl.textContent = 'Refreshing...';
    
    try {
        if (page === 'home') {
            // Pass skipSpinner = true to prevent internal spinner
            await window.loadHomeFeed(true, true);
        } else if (page === 'profile') {
            // Get current profile ID if viewing someone else's profile
            const profileHeader = document.getElementById('profile-header-title');
            const isOwnProfile = profileHeader && profileHeader.textContent === 'Profile';
            const viewingUserId = isOwnProfile ? null : (window.currentViewedUserId || null);
            // Pass skipSpinner = true to prevent internal spinner
            await window.loadProfile(viewingUserId, true);
        }
        
        // Haptic feedback on completion
        window.haptic('light');
        
    } catch (error) {
        console.error('Pull to refresh error:', error);
        window.showToast('Error refreshing. Try again.', 'error');
    } finally {
        // Reset after refresh completes
        setTimeout(() => {
            state.isRefreshing = false;
            resetPullIndicator(page);
        }, 300);
    }
}

// Helper to track currently viewed profile user ID
let currentViewedUserId = null;
window.setCurrentViewedUserId = function(userId) {
    currentViewedUserId = userId;
};

// ========== UPDATE MESSAGES TAB BADGE ==========
function updateMessagesTabBadge(count) {
    const messagesTab = document.querySelector('.nav-item[data-page="chats"]');
    if (!messagesTab) return;
    
    // Remove existing badge if any
    const existingBadge = messagesTab.querySelector('.tab-badge');
    if (existingBadge) existingBadge.remove();
    
    if (count > 0) {
        const badge = document.createElement('span');
        badge.className = 'tab-badge';
        badge.textContent = count > 99 ? '99+' : count;
        badge.style.cssText = `
            position: absolute;
            top: -5px;
            right: -10px;
            background: var(--accent-orange);
            color: white;
            font-size: 10px;
            font-weight: 600;
            padding: 2px 6px;
            border-radius: 20px;
            min-width: 18px;
            text-align: center;
        `;
        messagesTab.style.position = 'relative';
        messagesTab.appendChild(badge);
    }
}

// ========== GLOBAL UNREAD LISTENER (Updates badge anywhere) ==========
function startGlobalUnreadListener() {
    if (!window.auth?.currentUser) {
        console.log('No user, skipping global unread listener');
        return;
    }
    
    const userId = window.auth.currentUser.uid;
    const chatsRef = collection(window.db, 'chats');
    const q = query(
        chatsRef,
        where('participants', 'array-contains', userId)
    );
    
    if (globalUnreadListener) {
        globalUnreadListener();
        globalUnreadListener = null;
    }
    
    console.log('Starting global unread listener for user:', userId);
    
    globalUnreadListener = onSnapshot(q, (snapshot) => {
        let totalUnread = 0;
        snapshot.forEach(doc => {
            const chat = doc.data();
            const unreadCount = chat.unreadCount?.[userId] || 0;
            totalUnread += unreadCount;
        });
        
        console.log('Global unread count updated:', totalUnread);
        updateMessagesTabBadge(totalUnread);
    }, (error) => {
        console.error('Global unread listener error:', error);
    });
}

function stopGlobalUnreadListener() {
    if (globalUnreadListener) {
        globalUnreadListener();
        globalUnreadListener = null;
        console.log('Global unread listener stopped');
    }
}

// ========== INFINITE SCROLL FOR SEARCH ==========
function setupSearchInfiniteScroll() {
    const searchPage = document.getElementById('search-page');
    if (!searchPage) return;
    
    searchPage.addEventListener('scroll', () => {
        const scrollTop = searchPage.scrollTop;
        const scrollHeight = searchPage.scrollHeight;
        const clientHeight = searchPage.clientHeight;
        
        // Load more when 200px from bottom
        if (scrollTop + clientHeight >= scrollHeight - 200) {
            if (!isSearchLoading && hasMoreSearch) {
                performSearch(false);
            }
        }
    });
}

// ========== BOTTOM SHEET CARD -> EXPAND TO FULL PROFILE ==========
async function showUserBottomSheet(userId) {
    try {
        const user = await getSingleProfileFromSupabase(userId);
        if (!user) {
            window.showToast('Error loading profile', 'error');
            return;
        }
        
        // Get location data for active status
        const { data: locationData } = await supabase
            .from('provider_locations')
            .select('last_gig_date')
            .eq('user_id', userId)
            .single();
        
        const monthlyGigs = await getRolling30DayGigCount(userId);
        const reviewCount = user.reviewCount || 0;
        
        const userWithLocation = { ...user, ...(locationData || {}) };
        const activeStatus = getActiveStatus(userWithLocation);
        window.openBottomSheet(`
            <div style="text-align: center; padding: 8px 0;">
                <img src="${getOptimizedImageUrl(user.photoURL, 160, 160) || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || 'User')}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 12px;">
                <h3>${user.displayName || 'Anonymous'}</h3>
                ${activeStatus.active ? '<span class="active-badge">Active this week</span>' : ''}
                <div class="card-rating" style="justify-content: center; margin: 8px 0;">★ ${(user.rating || 0).toFixed(1)} (${reviewCount})</div>
                <div style="font-size: 13px; color: var(--text-secondary); margin: 4px 0;">📊 ${user.gigCount || 0} gigs total • 🔥 ${monthlyGigs} this month</div>
                <p style="color: var(--text-secondary); margin: 8px 0;">${user.bio || 'No bio yet'}</p>
                <div class="card-services" style="justify-content: center;">${(user.services || []).slice(0, 3).map(s => `<span class="service-tag">${s}</span>`).join('')}</div>
                <div style="display: flex; gap: 12px; margin-top: 20px;">
                    <button id="view-full-profile" class="btn-primary" style="flex: 1;">View Full Profile</button>
                    <button id="message-from-sheet" class="btn-secondary" style="flex: 1;">Message</button>
                </div>
            </div>
        `);
        document.getElementById('view-full-profile')?.addEventListener('click', () => {
            window.closeBottomSheet();
            loadProfile(userId);
            window.navigateToPage('profile');
        });
        document.getElementById('message-from-sheet')?.addEventListener('click', () => {
            window.closeBottomSheet();
            openChat(userId);
        });
    } catch (error) {
        console.error('showUserBottomSheet error:', error);
        window.showToast('Error loading profile', 'error');
    }
}

// ========== SEARCH (Map + List) ==========
async function initMap() {
    if (!mapContainer) return;
    if (!window.L) {
        console.error('Leaflet not loaded');
        return;
    }
    currentMap = window.L.map(mapContainer).setView([6.5244, 3.3792], 13);
    window.L.tileLayer('https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png', {
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OSM</a>'
    }).addTo(currentMap);
    if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition((pos) => {
            currentUserLocation = { lat: pos.coords.latitude, lng: pos.coords.longitude };
            // Set initial zoom based on default radius (1km = zoom 14)
            const zoomLevel = getZoomLevelFromRadius(currentRadius);
            currentMap.setView([currentUserLocation.lat, currentUserLocation.lng], zoomLevel);
            window.L.marker([currentUserLocation.lat, currentUserLocation.lng]).bindPopup('You are here').addTo(currentMap);
            performSearch();
        }, () => performSearch());
    } else {
        performSearch();
    }
}

async function performSearch(reset = false) {
    if (!window.db) return;
    
    if (reset) {
        if (searchListFeed) {
            searchListFeed.innerHTML = '<div class="loading-spinner"></div>';
        }
        searchOffset = 0;
        hasMoreSearch = true;
        if (searchListFeed) {
            while (searchListFeed.firstChild) {
                searchListFeed.removeChild(searchListFeed.firstChild);
            }
        }
    }
    
    if (isSearchLoading || !hasMoreSearch) return;
    isSearchLoading = true;
    
    try {
        const service = currentSearchService || searchServiceInput?.value || null;
        const radiusKm = currentRadius || 5;
        
        if (!currentUserLocation) {
            const location = await new Promise((resolve) => {
                if (!navigator.geolocation) {
                    resolve({ lat: 6.5244, lng: 3.3792 });
                    return;
                }
                navigator.geolocation.getCurrentPosition(
                    (position) => resolve({ lat: position.coords.latitude, lng: position.coords.longitude }),
                    () => resolve({ lat: 6.5244, lng: 3.3792 })
                );
            });
            currentUserLocation = location;
        }
        
        // SINGLE QUERY - No N+1!
        const { data: providers, error } = await supabase.rpc('search_providers', {
            p_current_lat: currentUserLocation.lat,
            p_current_lng: currentUserLocation.lng,
            p_radius_km: radiusKm,
            p_service_filter: service,
            p_limit: SEARCH_LIMIT,
            p_offset: searchOffset
        });
        
        if (error) throw error;
        
        if (!providers || providers.length === 0) {
            hasMoreSearch = false;
            if (reset && searchListFeed && searchListFeed.children.length === 0) {
                searchListFeed.innerHTML = '<div class="empty-state">No providers found. Try a different service or radius.</div>';
            }
            isSearchLoading = false;
            return;
        }
        
        searchOffset += providers.length;
        if (providers.length < SEARCH_LIMIT) hasMoreSearch = false;
        
        const filteredResults = providers.filter(p => p.user_id !== window.auth.currentUser?.uid);
        
        const cardsHtml = filteredResults.map(provider => {
            const servicesList = provider.services ? provider.services.split(',').map(s => s.trim()) : [];
            const activeStatus = provider.last_gig_date && new Date(provider.last_gig_date) > new Date(Date.now() - 7 * 24 * 60 * 60 * 1000);
            
            return `
            <div class="card" data-user-id="${provider.user_id}">
                <div class="card-header">
                    <img class="card-avatar" src="${getOptimizedImageUrl(provider.photo_url, 100, 100) || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(provider.display_name)}" alt="${provider.display_name}" loading="lazy">
                    <div class="card-info">
                        <div class="card-name">
                            ${provider.display_name}
                            ${activeStatus ? '<span class="active-badge">Active</span>' : ''}
                        </div>
                        <div class="card-rating">
                            <span class="star">★</span> ${(provider.rating || 0).toFixed(1)} (${provider.review_count || 0})
                        </div>
                    </div>
                </div>
                <div class="card-services">
                    ${servicesList.slice(0, 2).map(s => `<span class="service-tag">${s}</span>`).join('')}
                </div>
                <div class="card-stats">
                    <div class="stat-item">📊 ${provider.gig_count || 0} gigs total</div>
                    <div class="stat-item">🔥 ${provider.monthly_gigs || 0} gigs this month</div>
                </div>
                <div class="card-distance">📍 ${formatDistance(provider.distance_meters)}</div>
            </div>
        `;
        }).join('');
        
        if (reset) {
            if (searchListFeed) searchListFeed.innerHTML = cardsHtml;
        } else {
            if (searchListFeed) searchListFeed.insertAdjacentHTML('beforeend', cardsHtml);
        }
        
        document.querySelectorAll('#search-list-feed .card:not([data-listener])').forEach(card => {
            card.setAttribute('data-listener', 'true');
            card.addEventListener('click', () => {
                window.haptic('light');
                showUserBottomSheet(card.dataset.userId);
            });
        });
        
        if (currentViewMode === 'map' && currentMap) {
            updateMapMarkers(filteredResults);
        }
        
    } catch (error) {
        console.error('performSearch error:', error);
        if (reset && searchListFeed && searchListFeed.children.length === 0) {
            searchListFeed.innerHTML = '<div class="empty-state">Error loading search results. Try again.</div>';
        }
    } finally {
        isSearchLoading = false;
    }
}

function updateMapMarkers(users) {
    if (!currentMap) return;
    currentMarkers.forEach(m => currentMap.removeLayer(m));
    currentMarkers = [];
    users.forEach(user => {
        if (user.location) {
            const activeStatus = getActiveStatus(user);
            const markerColor = activeStatus.active ? '#E67E22' : '#999999';
            const marker = window.L.circleMarker([user.location.lat, user.location.lng], {
                radius: 12,
                fillColor: markerColor,
                color: '#fff',
                weight: 2,
                opacity: 1,
                fillOpacity: 0.8
            }).addTo(currentMap);
            marker.bindPopup(`
                <strong>${user.displayName || 'User'}</strong><br>
                ${activeStatus.active ? '🟢 Active' : '⚪ Inactive'}<br>
                ${user.services ? user.services[0] : ''}
            `);
            marker.on('click', () => showUserBottomSheet(user.id));
            currentMarkers.push(marker);
        }
    });
}

function updateListView(users) {
    if (!searchListFeed) return;
    if (users.length === 0) {
        searchListFeed.innerHTML = '<div class="empty-state">No providers found</div>';
        return;
    }
    searchListFeed.innerHTML = users.map(user => `
        <div class="card" data-user-id="${user.id}">
            <div class="card-header">
                <img class="card-avatar" src="${getOptimizedImageUrl(user.photoURL, 100, 100) || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || 'User')}" alt="${user.displayName}" loading="lazy">
                <div class="card-info">
                    <div class="card-name">
                        ${user.displayName || 'Anonymous'}
                        ${getActiveStatus(user).active ? '<span class="active-badge">Active</span>' : ''}
                    </div>
                    <div class="card-rating">★ ${(user.rating || 0).toFixed(1)} (${user.reviewCount || 0})</div>
                </div>
            </div>
            <div class="card-services">${(user.services || []).slice(0, 2).map(s => `<span class="service-tag">${s}</span>`).join('')}</div>
            <div class="card-distance">📍 ${user.distance ? formatDistance(user.distance) : 'No location'}</div>
        </div>
    `).join('');
    document.querySelectorAll('#search-list-feed .card').forEach(card => {
        card.addEventListener('click', () => showUserBottomSheet(card.dataset.userId));
    });
}

function setupSearch() {
    if (searchServiceInput) {
        searchServiceInput.addEventListener('input', (e) => {
            currentSearchService = e.target.value;
            searchOffset = 0;
            hasMoreSearch = true;
            performSearch(true);
        });
    }
    if (radiusSlider && radiusValue) {
        radiusSlider.addEventListener('input', (e) => {
            currentRadius = parseInt(e.target.value);
            radiusValue.textContent = currentRadius;
            
            // Update map zoom if map exists
            if (currentMap && currentUserLocation) {
                const zoomLevel = getZoomLevelFromRadius(currentRadius);
                currentMap.setView([currentUserLocation.lat, currentUserLocation.lng], zoomLevel);
            }
            
            // Reset and perform search
            searchOffset = 0;
            hasMoreSearch = true;
            performSearch(true);
        });
    }
    if (mapViewBtn && listViewBtn && mapContainer && searchListView) {
        mapViewBtn.addEventListener('click', () => {
            currentViewMode = 'map';
            mapViewBtn.classList.add('active');
            listViewBtn.classList.remove('active');
            mapContainer.classList.remove('hidden');
            searchListView.classList.add('hidden');
            window.haptic('light');
        });
        listViewBtn.addEventListener('click', () => {
            currentViewMode = 'list';
            listViewBtn.classList.add('active');
            mapViewBtn.classList.remove('active');
            mapContainer.classList.add('hidden');
            searchListView.classList.remove('hidden');
            window.haptic('light');
        });
    }
}

// ========== CHAT LIST (REAL-TIME WITH UNREAD COUNTS) ==========
// Collect all unique user IDs
        const userIds = [...new Set(
            snapshot.docs.map(doc => {
                const chat = doc.data();
                return chat.participants.find(p => p !== window.auth.currentUser.uid);
            })
        )];
        
        // Fetch all profiles in ONE query
        const { data: profiles, error: profilesError } = await supabase.rpc('get_chat_users', {
            p_user_ids: userIds
        });
        
        if (profilesError) throw profilesError;
        
        // Build profiles map
        const profilesMap = {};
        profiles.forEach(p => { profilesMap[p.user_id] = p; });
        
        // Build chats array
        for (const chatDoc of snapshot.docs) {
            const chat = { id: chatDoc.id, ...chatDoc.data() };
            const otherUserId = chat.participants.find(p => p !== window.auth.currentUser.uid);
            const unreadCount = chat.unreadCount?.[window.auth.currentUser.uid] || 0;
            totalUnread += unreadCount;
            
            const userData = profilesMap[otherUserId] || {};
            
            chats.push({ 
                ...chat, 
                otherUser: { 
                    id: otherUserId, 
                    displayName: userData.display_name || 'User',
                    photoURL: userData.photo_url,
                    services: userData.services
                },
                unreadCount: unreadCount
            });
        }

async function openChat(userId, chatId = null) {
    currentChatUser = userId;
    currentChatId = chatId;
    let chat = chatId;
    if (!chat) {
        try {
            const chatsRef = collection(window.db, 'chats');
            const q = query(chatsRef, where('participants', 'array-contains', window.auth.currentUser.uid));
            const existingChat = await getDocs(q);
            let found = null;
            existingChat.forEach(doc => {
                if (doc.data().participants.includes(userId)) found = doc.id;
            });
            chat = found;
            if (!chat) {
                const chatsRef = collection(window.db, 'chats');
                const newChatRef = await addDoc(chatsRef, {
                    participants: [window.auth.currentUser.uid, userId],
                    createdAt: new Date().toISOString(),
                    lastMessageTime: new Date().toISOString(),
                    lastMessage: ''
                });
                chat = newChatRef.id;
            }
            currentChatId = chat;
        } catch (error) {
            console.error('openChat error:', error);
            window.showToast('Error opening chat', 'error');
            return;
        }
    }

    // Reset unread count for this chat room
const chatRoomRef = doc(window.db, 'chats', chat);
await updateDoc(chatRoomRef, {
    [`unreadCount.${window.auth.currentUser.uid}`]: 0
});
    
    try {
        const userData = await getSingleProfileFromSupabase(userId);
        if (!userData) {
            window.showToast('Error loading user', 'error');
            return;
        }
        window.openBottomSheet(`
            <div style="display: flex; justify-content: space-between; align-items: center; margin-bottom: 16px;">
                <h3>${userData.displayName || 'User'}</h3>
                <button id="close-chat" class="icon-btn">✕</button>
            </div>
            <div id="chat-messages" style="height: 400px; overflow-y: auto; margin-bottom: 16px; display: flex; flex-direction: column; gap: 8px;"></div>
            <div style="display: flex; gap: 8px;">
                <input type="text" id="chat-input" placeholder="Type a message..." class="search-input" style="flex: 1;">
                <button id="send-message" class="btn-primary" style="padding: 12px 20px;">Send</button>
            </div>
            <div id="pending-review-toast-provider" style="display: none; margin-top: 12px; padding: 12px; background: var(--warning-yellow); border-radius: 10px; text-align: center;"></div>
            <div id="pending-review-toast-client" style="display: none; margin-top: 12px; padding: 12px; background: var(--warning-yellow); border-radius: 10px; text-align: center;"></div>
            <button id="register-gig-chat" class="btn-secondary" style="width: 100%; margin-top: 12px; padding: 12px; background: var(--accent-orange); color: white;">📋 Register Gig with this person</button>
            <div style="display: flex; gap: 12px; margin-top: 12px;">
                <button id="submit-review-chat" class="btn-primary" style="flex: 1; padding: 12px; display: none;">⭐ Submit Review</button>
                <button id="cancel-gig-chat" class="btn-secondary" style="flex: 1; padding: 12px; display: none; border-color: var(--error-red); color: var(--error-red);">❌ Cancel Gig</button>
            </div>
        `);
        document.getElementById('close-chat').addEventListener('click', () => window.closeBottomSheet());
        const messagesDiv = document.getElementById('chat-messages');
        const input = document.getElementById('chat-input');
        document.getElementById('send-message').addEventListener('click', () => sendMessage(chat, input.value));
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(chat, input.value); });
        document.getElementById('register-gig-chat').addEventListener('click', () => registerGig(chat, userId));
        document.getElementById('submit-review-chat')?.addEventListener('click', () => showReviewBottomSheet(userId, chat));
        document.getElementById('cancel-gig-chat')?.addEventListener('click', () => cancelGig(chat, userId));
        if (currentMessagesUnsubscribe) currentMessagesUnsubscribe();
        
        const messagesRef = collection(window.db, 'chats', chat, 'messages');
        const q = query(
            messagesRef,
            orderBy('timestamp', 'desc'),
            limit(MESSAGES_PER_PAGE)
        );
        
        // Reset pagination state
        lastVisibleMessage = null;
        hasMoreMessages = true;
        isLoadingMoreMessages = false;
        
        currentMessagesUnsubscribe = onSnapshot(q, (snapshot) => {
            messagesDiv.innerHTML = '';
            
            if (snapshot.empty) {
                hasMoreMessages = false;
                return;
            }
            
            // Store the last visible message for pagination
            lastVisibleMessage = snapshot.docs[snapshot.docs.length - 1];
            hasMoreMessages = snapshot.docs.length === MESSAGES_PER_PAGE;
            
            // Reverse to display oldest to newest (bottom)
            const reversedDocs = [...snapshot.docs].reverse();
            reversedDocs.forEach(doc => {
                const msg = doc.data();
                const isMe = msg.senderId === window.auth.currentUser.uid;
                messagesDiv.innerHTML += `
                    <div class="message-wrapper" data-message-id="${doc.id}" style="display: flex; justify-content: ${isMe ? 'flex-end' : 'flex-start'};">
                        <div style="max-width: 70%; padding: 10px 14px; border-radius: 18px; background: ${isMe ? 'var(--accent-orange)' : 'var(--bg-secondary)'}; color: ${isMe ? 'white' : 'var(--text-primary)'};">
                            ${msg.text}
                            ${msg.imageUrl ? `<img src="${msg.imageUrl}" style="max-width: 200px; border-radius: 10px; margin-top: 8px;">` : ''}
                            <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">${new Date(msg.timestamp).toLocaleTimeString()}</div>
                        </div>
                    </div>
                `;
            });
            // Check if user was already at bottom before adding new messages
            const wasAtBottom = messagesDiv.scrollTop + messagesDiv.clientHeight >= messagesDiv.scrollHeight - 50;
            
            if (wasAtBottom) {
                messagesDiv.scrollTop = messagesDiv.scrollHeight;
            }
            
            // Setup scroll observer for loading more messages
            setupMessagesScrollObserver(messagesDiv, chat);
            
            document.querySelectorAll('.message-wrapper').forEach(wrapper => {
                let pressTimer;
                wrapper.addEventListener('touchstart', () => {
                    pressTimer = setTimeout(() => {
                        const messageId = wrapper.dataset.messageId;
                        if (confirm('Delete this message?')) {
                            const messageRef = doc(window.db, 'chats', chat, 'messages', messageId);
                            deleteDoc(messageRef);
                            window.haptic('heavy');
                        }
                    }, 500);
                });
                wrapper.addEventListener('touchend', () => clearTimeout(pressTimer));
                wrapper.addEventListener('touchmove', () => clearTimeout(pressTimer));
            });
        });
        
        // Check gig status and update UI accordingly
        await checkGigStatusAndUpdateUI(chat, userId);
        
    } catch (error) {
        console.error('openChat error:', error);
        window.showToast('Error opening chat', 'error');
    }
}

function setupMessagesScrollObserver(messagesDiv, chatId) {
    messagesDiv.addEventListener('scroll', async () => {
        const scrollTop = messagesDiv.scrollTop;
        
        // If scrolled near the top (within 100px) and not already loading and has more messages
        if (scrollTop < 100 && !isLoadingMoreMessages && hasMoreMessages) {
            await loadMoreMessages(chatId, messagesDiv);
        }
    });
}

async function loadMoreMessages(chatId, messagesDiv) {
    if (!chatId || !lastVisibleMessage) return;
    
    isLoadingMoreMessages = true;
    
    try {
        const messagesRef = collection(window.db, 'chats', chatId, 'messages');
        const q = query(
            messagesRef,
            orderBy('timestamp', 'asc'),
            startAfter(lastVisibleMessage),
            limit(MESSAGES_PER_PAGE)
        );
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            hasMoreMessages = false;
            isLoadingMoreMessages = false;
            return;
        }
        
        // Build HTML for older messages
        let olderMessagesHtml = '';
        snapshot.forEach(doc => {
            const msg = doc.data();
            const isMe = msg.senderId === window.auth.currentUser.uid;
            olderMessagesHtml = `
                <div class="message-wrapper" data-message-id="${doc.id}" style="display: flex; justify-content: ${isMe ? 'flex-end' : 'flex-start'};">
                    <div style="max-width: 70%; padding: 10px 14px; border-radius: 18px; background: ${isMe ? 'var(--accent-orange)' : 'var(--bg-secondary)'}; color: ${isMe ? 'white' : 'var(--text-primary)'};">
                        ${msg.text}
                        ${msg.imageUrl ? `<img src="${msg.imageUrl}" style="max-width: 200px; border-radius: 10px; margin-top: 8px;">` : ''}
                        <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">${new Date(msg.timestamp).toLocaleTimeString()}</div>
                    </div>
                </div>
            ` + olderMessagesHtml;
        });
        
        // Update lastVisibleMessage to the first doc in this batch
        lastVisibleMessage = snapshot.docs[0];
        
        // Remember current scroll height
        const oldScrollHeight = messagesDiv.scrollHeight;
        
        // Insert older messages at the top
        messagesDiv.insertAdjacentHTML('afterbegin', olderMessagesHtml);
        
        // Maintain scroll position
        const newScrollHeight = messagesDiv.scrollHeight;
        messagesDiv.scrollTop = newScrollHeight - oldScrollHeight;
        
        // Check if there are more messages
        hasMoreMessages = snapshot.docs.length === MESSAGES_PER_PAGE;
        
    } catch (error) {
        console.error('loadMoreMessages error:', error);
    } finally {
        isLoadingMoreMessages = false;
    }
}

async function sendMessage(chatId, text) {
    if (!text.trim()) return;
    try {
        const messagesRef = collection(window.db, 'chats', chatId, 'messages');
        await addDoc(messagesRef, {
            senderId: window.auth.currentUser.uid,
            text: text,
            timestamp: new Date().toISOString()
        });
        
        const chatRef = doc(window.db, 'chats', chatId);
        
        // Get chat data to find other participant (BEFORE updating)
        const chatDoc = await getDoc(chatRef);
        const chatData = chatDoc.data();
        const otherUserId = chatData.participants.find(p => p !== window.auth.currentUser.uid);
        
        // Update chat room with last message and increment unread count for receiver
        await updateDoc(chatRef, {
            lastMessage: text,
            lastMessageTime: new Date().toISOString(),
            [`unreadCount.${otherUserId}`]: increment(1)
        });
        
        // Notify the other user
        const senderName = window.currentUserData?.displayName || 'Someone';
        
        window.addNotification(
            'New Message',
            `💬 New message from ${senderName}`,
            `/chat/${chatId}`
        );
        
        // Send push notification to the other user
        await sendPushNotification(
            otherUserId,
            'New Message',
            `${senderName}: ${text.substring(0, 50)}${text.length > 50 ? '...' : ''}`,
            `/chat/${chatId}`
        );
        
        document.getElementById('chat-input').value = '';
        window.haptic('light');
    } catch (error) {
        console.error('sendMessage error:', error);
        window.showToast('Error sending message', 'error');
    }
}

async function checkPendingReview(chatId, userId) {
    try {
        const { data: pendingGig } = await supabase
            .from('gigs')
            .select('id')
            .eq('provider_id', window.auth.currentUser.uid)
            .eq('client_id', userId)
            .eq('status', 'pending_review')
            .maybeSingle();
        
        const toast = document.getElementById('pending-review-toast-provider');
        if (pendingGig && toast) {
            toast.style.display = 'block';
        }
    } catch (error) {
        console.error('checkPendingReview error:', error);
    }
}

async function checkGigStatusAndUpdateUI(chatId, userId) {
    try {
        const currentUser = window.auth.currentUser.uid;
        
        // Query for pending gig where current user is provider
        const { data: providerGig } = await supabase
            .from('gigs')
            .select('id')
            .eq('provider_id', currentUser)
            .eq('client_id', userId)
            .eq('status', 'pending_review')
            .maybeSingle();
        
        // Query for pending gig where current user is client
        const { data: clientGig } = await supabase
            .from('gigs')
            .select('id')
            .eq('client_id', currentUser)
            .eq('provider_id', userId)
            .eq('status', 'pending_review')
            .maybeSingle();
        
        const registerBtn = document.getElementById('register-gig-chat');
        const reviewBtn = document.getElementById('submit-review-chat');
        const cancelBtn = document.getElementById('cancel-gig-chat');
        const providerToast = document.getElementById('pending-review-toast-provider');
        const clientToast = document.getElementById('pending-review-toast-client');
        
        // Get other user's name for toasts
        const otherUser = await getSingleProfileFromSupabase(userId);
        const otherUserName = otherUser?.displayName || 'User';
        
        if (providerGig) {
            // Current user is provider with pending gig
            if (registerBtn) {
                registerBtn.disabled = true;
                registerBtn.style.opacity = '0.5';
                registerBtn.style.cursor = 'not-allowed';
            }
            if (providerToast) {
                providerToast.textContent = `⏳ Waiting for ${otherUserName} to review this gig`;
                providerToast.style.display = 'block';
            }
            if (reviewBtn) reviewBtn.style.display = 'none';
            if (cancelBtn) cancelBtn.style.display = 'none';
        } 
        else if (clientGig) {
            // Current user is client with pending gig
            if (registerBtn) {
                registerBtn.disabled = true;
                registerBtn.style.opacity = '0.5';
                registerBtn.style.cursor = 'not-allowed';
            }
            if (clientToast) {
                clientToast.textContent = `⭐ You have a pending review for ${otherUserName}`;
                clientToast.style.display = 'block';
            }
            if (reviewBtn) reviewBtn.style.display = 'block';
            if (cancelBtn) cancelBtn.style.display = 'block';
        }
        else {
            // No pending gig
            if (registerBtn) {
                registerBtn.disabled = false;
                registerBtn.style.opacity = '1';
                registerBtn.style.cursor = 'pointer';
            }
            if (providerToast) providerToast.style.display = 'none';
            if (clientToast) clientToast.style.display = 'none';
            if (reviewBtn) reviewBtn.style.display = 'none';
            if (cancelBtn) cancelBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('checkGigStatusAndUpdateUI error:', error);
    }
}

async function cancelGig(chatId, providerId) {
    try {
        // Show confirmation dialog
        const confirmed = confirm('⚠️ Cancel Gig Request\n\nAre you sure you want to cancel this gig?\n\n• The provider will be notified\n\n[OK] to Cancel  [Cancel] to Go Back');
        
        if (!confirmed) return;
        
        const currentUser = window.auth.currentUser.uid;
        
        // Find the pending gig in Supabase
        const { data: existingGig, error: findError } = await supabase
            .from('gigs')
            .select('id')
            .eq('client_id', currentUser)
            .eq('provider_id', providerId)
            .eq('status', 'pending_review')
            .maybeSingle();
        
        if (findError) {
            console.error('Error finding gig:', findError);
            window.showToast('Error finding gig', 'error');
            return;
        }
        
        if (!existingGig) {
            window.showToast('No pending gig found to cancel', 'error');
            return;
        }
        
        // Call the database function
        const { data, error } = await supabase.rpc('cancel_gig', {
            p_gig_id: existingGig.id,
            p_cancelled_by: currentUser
        });
        
        if (error) throw error;
        
        if (!data.success) {
            throw new Error(data.message);
        }
        
        // Update chat to remove pending review flag
        const chatRef = doc(window.db, 'chats', chatId);
        await updateDoc(chatRef, { pendingReview: false });
        
        // Notify provider
        const providerData = await getSingleProfileFromSupabase(providerId);
        const providerName = providerData?.displayName || 'Provider';
        
        window.addNotification(
            'Gig Cancelled',
            `${providerName} has cancelled the gig request. No credits were deducted.`
        );
        
        // Send push notification to the provider
        await sendPushNotification(
            providerId,
            'Gig Cancelled',
            `${window.currentUserData?.displayName || 'Client'} cancelled the gig request. No credits were deducted.`,
            `/chat/${chatId}`
        );
        
        window.showToast('✅ Gig cancelled successfully', 'success');
        
        // Close and reopen chat to refresh UI
        window.closeBottomSheet();
        setTimeout(() => {
            openChat(providerId, chatId);
        }, 500);
        
    } catch (error) {
        console.error('cancelGig error:', error);
        window.showToast('Error cancelling gig', 'error');
    }
}

async function checkAndShowReviewButton(chatId, userId) {
    try {
        const { data: pendingGig } = await supabase
            .from('gigs')
            .select('id')
            .eq('client_id', window.auth.currentUser.uid)
            .eq('provider_id', userId)
            .eq('status', 'pending_review')
            .maybeSingle();
        
        const registerBtn = document.getElementById('register-gig-chat');
        const reviewBtn = document.getElementById('submit-review-chat');
        
        if (pendingGig) {
            if (registerBtn) registerBtn.style.display = 'none';
            if (reviewBtn) reviewBtn.style.display = 'block';
        } else {
            if (registerBtn) registerBtn.style.display = 'block';
            if (reviewBtn) reviewBtn.style.display = 'none';
        }
    } catch (error) {
        console.error('checkAndShowReviewButton error:', error);
    }
}

async function showReviewBottomSheet(providerId, chatId) {
    try {
        const provider = await getSingleProfileFromSupabase(providerId);
        if (!provider) {
            window.showToast('Error loading provider', 'error');
            return;
        }
        
        let selectedRating = 0;
        
        const starsHtml = [1, 2, 3, 4, 5].map(star => `
            <span class="review-star" data-rating="${star}" style="font-size: 40px; cursor: pointer; color: #ccc; transition: all 0.15s ease;">★</span>
        `).join('');
        
        window.openBottomSheet(`
            <h3 style="margin-bottom: 8px; text-align: center;">Review ${provider.displayName || 'Provider'}</h3>
            <p style="margin-bottom: 16px; text-align: center; color: var(--text-secondary);">How was your experience?</p>
            <div id="rating-stars" style="display: flex; justify-content: center; gap: 8px; margin-bottom: 20px;">
                ${starsHtml}
            </div>
            <textarea id="review-comment" placeholder="Share your experience (optional)" class="search-input" style="margin-bottom: 16px; min-height: 100px;"></textarea>
            <button id="submit-review-btn" class="btn-primary" style="width: 100%; padding: 14px;">Submit Review</button>
        `);
        
        // Star rating handler
        document.querySelectorAll('.review-star').forEach(star => {
            star.addEventListener('click', () => {
                selectedRating = parseInt(star.dataset.rating);
                document.querySelectorAll('.review-star').forEach((s, index) => {
                    if (index < selectedRating) {
                        s.style.color = '#ffc107';
                    } else {
                        s.style.color = '#ccc';
                    }
                });
            });
        });
        
        // Submit review handler
        const submitBtn = document.getElementById('submit-review-btn');
        if (submitBtn) {
            const newSubmitBtn = submitBtn.cloneNode(true);
            submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
            
            newSubmitBtn.addEventListener('click', async () => {
                if (selectedRating === 0) {
                    window.showToast('Please select a rating', 'error');
                    return;
                }
                const comment = document.getElementById('review-comment')?.value || '';
                window.closeBottomSheet();
                await submitReview(providerId, window.auth.currentUser.uid, selectedRating, comment);
                // Refresh chat view
                window.closeBottomSheet();
                openChat(providerId, chatId);
            });
        }
    } catch (error) {
        console.error('showReviewBottomSheet error:', error);
        window.showToast('Error loading review screen', 'error');
    }
}

// ========== REGISTER GIG ==========
async function registerGig(chatId, clientId) {
    try {
        // Call the database function
        const { data, error } = await supabase.rpc('register_gig', {
            p_provider_id: window.auth.currentUser.uid,
            p_client_id: clientId,
            p_chat_id: chatId
        });
        
        if (error) throw error;
        
        if (!data.success) {
            window.showToast(data.message, 'error');
            return;
        }
        
        // Update chat (still in Firestore)
        const chatRef = doc(window.db, 'chats', chatId);
        await updateDoc(chatRef, { pendingReview: true });
        
        // Notify provider
        window.addNotification('Gig Registered', 'Client has been notified to review you');
        
        // Notify client
        const providerName = window.currentUserData?.displayName || 'Provider';
        window.addNotification(
            'New Gig Registration',
            `📋 ${providerName} registered a gig with you. Please review within 7 days.`,
            `/chat/${chatId}`
        );
        
        await sendPushNotification(
            clientId,
            'New Gig Request',
            `${providerName} registered a gig with you. Please review within 7 days.`,
            `/chat/${chatId}`
        );
        
        window.showToast('Gig registered! Client will review within 7 days.');
        window.haptic('heavy');
        
        window.closeBottomSheet();
        setTimeout(() => openChat(clientId, chatId), 500);
        
    } catch (error) {
        console.error('registerGig error:', error);
        window.showToast(error.message || 'Error registering gig', 'error');
    }
}

// ========== REVIEW SYSTEM ==========
async function submitReview(providerId, clientId, rating, reviewText) {
    try {
        // Call the database function
        const { data, error } = await supabase.rpc('submit_review', {
            p_provider_id: providerId,
            p_client_id: clientId,
            p_rating: rating,
            p_review_text: reviewText
        });
        
        if (error) throw error;
        
        if (!data.success) {
            throw new Error(data.message);
        }
        
        // Update chat (still in Firestore)
        const chatRef = doc(window.db, 'chats', currentChatId);
        await updateDoc(chatRef, { pendingReview: false });
        
        // Notify provider about the review
        const clientName = window.currentUserData?.displayName || 'Client';
        window.addNotification(
            'New Review',
            `⭐ ${clientName} reviewed and rated you ${rating} stars. 1 credit has been deducted.`
        );
        
        await sendPushNotification(
            providerId,
            'New Review',
            `${clientName} reviewed and rated you ${rating} stars. 1 credit has been deducted.`,
            `/profile/${providerId}`
        );
        
        // ========== CREDIT BALANCE ALERTS ==========
        if (data.credit_alert) {
            let creditMessage = '';
            if (data.credit_alert === 'two') {
                creditMessage = '⚠️ You have 2 credits left. Buy more to keep registering gigs.';
            } else if (data.credit_alert === 'one') {
                creditMessage = '⚠️ Only 1 credit left! Register one more gig then you\'ll need more credits.';
            } else if (data.credit_alert === 'zero') {
                creditMessage = '❌ You\'re out of credits. Buy credits to register new gigs.';
            }
            
            if (creditMessage) {
                window.addNotification('Low Credits', creditMessage);
                await sendPushNotification(providerId, 'Low Credits Alert', creditMessage, '/profile');
            }
        }
        
        // ========== GIG MILESTONE ALERTS ==========
        if (data.milestone) {
            let milestoneMessage = '';
            if (data.milestone === 1) {
                milestoneMessage = '🎉 Congrats on your first gig! Keep going!';
            } else if (data.milestone === 5) {
                milestoneMessage = '🌟 5 gigs completed! You\'re on fire!';
            } else if (data.milestone === 10) {
                milestoneMessage = '🏆 10 gigs! You\'re a GigsCourt pro!';
            } else if (data.milestone === 25) {
                milestoneMessage = '👑 25 gigs! You\'re one of our top providers!';
            } else if (data.milestone === 50) {
                milestoneMessage = '💎 50 gigs! Legendary status!';
            }
            
            if (milestoneMessage) {
                window.addNotification('🎉 Milestone Achieved!', milestoneMessage);
                await sendPushNotification(providerId, 'Milestone Achieved! 🎉', milestoneMessage, '/profile');
            }
        }
        
        window.showToast(`Review submitted! ${rating} stars. Thank you!`);
        window.haptic('heavy');
        
        return data;
        
    } catch (error) {
        console.error('submitReview error:', error);
        window.showToast(error.message || 'Error submitting review', 'error');
        throw error;
    }
}

async function showReviews(providerId) {
    try {
        const { data: reviews, error } = await supabase
            .from('reviews')
            .select('*')
            .eq('provider_id', providerId)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!reviews || reviews.length === 0) {
            window.showToast('No reviews yet');
            return;
        }
        
        let reviewsHtml = '<h3 style="margin-bottom: 16px;">Reviews</h3>';
        reviews.forEach(review => {
            reviewsHtml += `
                <div style="padding: 12px; border-bottom: 1px solid var(--border-light);">
                    <div style="font-weight: 600;">★ ${review.rating}</div>
                    <p style="color: var(--text-secondary);">${review.review || ''}</p>
                    <div style="font-size: 11px; color: var(--text-muted);">${new Date(review.created_at).toLocaleDateString()}</div>
                </div>
            `;
        });
        window.openBottomSheet(reviewsHtml);
    } catch (error) {
        console.error('showReviews error:', error);
        window.showToast('Error loading reviews', 'error');
    }
}

// ========== CREDITS (Paystack) ==========
function buyCredits() {
    const packages = [
        { credits: 5, price: 2500 },
        { credits: 10, price: 4500 },
        { credits: 20, price: 8000 }
    ];
    window.openBottomSheet(`
        <h3 style="margin-bottom: 16px;">Buy Credits</h3>
        ${packages.map(p => `
            <button class="credit-package" data-credits="${p.credits}" data-price="${p.price}" style="width: 100%; padding: 16px; margin-bottom: 12px; background: var(--bg-secondary); border: 1px solid var(--border-light); border-radius: 16px; text-align: left;">
                <strong>${p.credits} credits</strong> — ₦${p.price.toLocaleString()}
            </button>
        `).join('')}
        <button id="transaction-history-btn" class="btn-secondary" style="width: 100%; margin-top: 12px;">View Transaction History</button>
    `);
    document.querySelectorAll('.credit-package').forEach(btn => {
        btn.addEventListener('click', async () => {
            const credits = parseInt(btn.dataset.credits);
            const price = parseInt(btn.dataset.price);
            window.closeBottomSheet();
            if (window.PaystackPop) {
                const handler = window.PaystackPop.setup({
                    key: PAYSTACK_PUBLIC_KEY,
                    email: window.auth.currentUser.email,
                    amount: price * 100,
                    currency: 'NGN',
                    callback: async (response) => {
                        try {
                            // Call the database function
                            const { data, error } = await supabase.rpc('add_credits', {
                                p_user_id: window.auth.currentUser.uid,
                                p_credits: credits,
                                p_amount: price,
                                p_reference: response.reference
                            });
                            
                            if (error) throw error;
                            
                            if (!data.success) {
                                throw new Error(data.message);
                            }
                            
                            // Update in-memory currentUserData
                            if (window.currentUserData) {
                                window.currentUserData.credits = data.new_credits;
                            }
                            
                            window.showToast(`Added ${credits} credits!`);
                            window.haptic('heavy');
                            loadProfile();
                            
                        } catch (error) {
                            console.error('Credit purchase error:', error);
                            window.showToast(error.message || 'Error processing purchase', 'error');
                        }
                    }
                });
                handler.openIframe();
            } else {
                window.showToast('Paystack not loaded. Please refresh.', 'error');
            }
        });
    });
    document.getElementById('transaction-history-btn')?.addEventListener('click', showTransactionHistory);
}

async function showTransactionHistory() {
    try {
        const { data: transactions, error } = await supabase
            .from('transactions')
            .select('*')
            .eq('user_id', window.auth.currentUser.uid)
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!transactions || transactions.length === 0) {
            window.showToast('No transactions yet');
            return;
        }
        
        let html = '<h3 style="margin-bottom: 16px;">Transaction History</h3>';
        transactions.forEach(t => {
            html += `
                <div style="padding: 12px; border-bottom: 1px solid var(--border-light);">
                    <div><strong>${t.type === 'credit_purchase' ? '💰 Purchased' : '📋 Gig Used'}</strong></div>
                    <div>${t.credits} credits • ₦${t.amount?.toLocaleString() || '0'}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${new Date(t.created_at).toLocaleDateString()}</div>
                </div>
            `;
        });
        window.openBottomSheet(html);
    } catch (error) {
        console.error('showTransactionHistory error:', error);
        window.showToast('Error loading transactions', 'error');
    }
}

// ========== PROFILE PAGE (Complete) ==========
async function loadProfile(userId = null, skipSpinner = false) {
    const targetId = userId || window.auth.currentUser?.uid;
    if (!targetId || !profileContent) return;
    
    try {
        if (!skipSpinner) {
            profileContent.innerHTML = '<div class="loading-spinner"></div>';
        }
        
        const profile = await getSingleProfileFromSupabase(targetId);
        
        if (!profile) {
            profileContent.innerHTML = '<div class="empty-state">User not found</div>';
            return;
        }
        
        const isOwnProfile = targetId === window.auth.currentUser?.uid;
        window.setCurrentViewedUserId(targetId);
        
        // Fetch rolling 30-day gig count
        const monthlyGigs = await getRolling30DayGigCount(targetId);
        
        // Get location data for active status
        const { data: locationData } = await supabase
            .from('provider_locations')
            .select('last_gig_date')
            .eq('user_id', targetId)
            .single();
        
        const userWithLocation = { ...profile, ...(locationData || {}) };
        const activeStatus = getActiveStatus(userWithLocation);
        
        const profileHeaderTitle = document.getElementById('profile-header-title');
        const settingsBtn = document.getElementById('profile-settings-btn');
        
        if (profileHeaderTitle) {
            if (isOwnProfile) {
                profileHeaderTitle.textContent = 'Profile';
                if (settingsBtn) settingsBtn.style.display = 'flex';
            } else {
                profileHeaderTitle.textContent = profile.displayName || 'User';
                if (settingsBtn) settingsBtn.style.display = 'none';
            }
        }
        
        profileContent.innerHTML = `
            <div class="profile-header">
                <img class="profile-avatar" src="${getOptimizedImageUrl(profile.photoURL, 200, 200) || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(profile.displayName || 'User')}" alt="" data-user-id="${profile.id}">
                <h2 class="profile-name">${profile.displayName || 'Anonymous'}</h2>
                <p class="profile-bio">${profile.bio || 'No bio yet'}</p>
                ${activeStatus.active ? '<span class="active-badge">Active this week</span>' : ''}
            </div>
            <div class="profile-stats">
                <div class="stat" data-stat="gigs">
                    <div class="stat-number">${profile.gigCount || 0}</div>
                    <div class="stat-label">Gigs</div>
                </div>
                <div class="stat" data-stat="rating">
                    <div class="stat-number">★ ${(profile.rating || 0).toFixed(1)}</div>
                    <div class="stat-label">Rating</div>
                </div>
                <div class="stat" data-stat="credits">
                    <div class="stat-number">${profile.credits || 0}</div>
                    <div class="stat-label">Credits</div>
                </div>
            </div>
            <div class="profile-monthly-gigs" style="text-align: center; padding: 8px 0; color: var(--accent-orange); font-weight: 500;">
                🔥 ${monthlyGigs} gigs this month
            </div>
            <div class="profile-address">📍 ${profile.addressText || 'No address set'}</div>
            <div class="profile-actions">
                ${isOwnProfile ? `
                    <button id="edit-profile-btn" class="btn-secondary">Edit Profile</button>
                    <button id="register-gig-profile-btn" class="btn-primary">Register Gig</button>
                    <button id="buy-credits-btn" class="btn-primary">Buy Credits</button>
                    <button id="settings-btn" class="btn-secondary">Settings</button>
                ` : `
                    <button id="contact-now-btn" class="btn-primary">Contact Now</button>
                `}
            </div>
            <div class="services-section">
                <div class="section-title">Services Offered</div>
                <div class="card-services" id="profile-services-list">${(profile.services || []).map(s => `<span class="service-tag">${s}</span>`).join('')}</div>
                ${isOwnProfile ? '<button id="edit-services-btn" class="btn-secondary" style="margin-top: 12px;">Edit Services</button>' : ''}
            </div>
            <div class="portfolio-section">
                <div class="section-title">Portfolio</div>
                <div class="portfolio-grid" id="portfolio-grid">
                    ${(profile.portfolio || []).map(img => `<img src="${getOptimizedImageUrl(img, 200, 200)}" class="portfolio-item" loading="lazy">`).join('')}
                </div>
                ${isOwnProfile ? '<button id="add-portfolio-btn" class="btn-secondary" style="margin-top: 12px;">+ Add Portfolio Image (Max 15)</button>' : ''}
            </div>
        `;
        
        if (isOwnProfile) {
            document.getElementById('edit-profile-btn')?.addEventListener('click', editProfile);
            document.getElementById('register-gig-profile-btn')?.addEventListener('click', showRecentChatsForGig);
            document.getElementById('buy-credits-btn')?.addEventListener('click', buyCredits);
            document.getElementById('settings-btn')?.addEventListener('click', showSettings);
            document.getElementById('profile-settings-btn')?.addEventListener('click', showSettings);
            document.getElementById('edit-services-btn')?.addEventListener('click', editServices);
            document.getElementById('add-portfolio-btn')?.addEventListener('click', addPortfolioImage);
        } else {
            document.getElementById('contact-now-btn')?.addEventListener('click', () => openChat(profile.id));
        }
        
        document.querySelectorAll('.portfolio-item').forEach(img => {
            img.addEventListener('click', () => {
    const fullSizeUrl = getOptimizedImageUrl(img.src, null, null, true);
    window.openBottomSheet(`<img src="${fullSizeUrl}" style="width: 100%; border-radius: 20px;">`);
});
        });
        document.querySelector('.stat[data-stat="rating"]')?.addEventListener('click', () => showReviews(targetId));
        
    } catch (error) {
        console.error('loadProfile error:', error);
        profileContent.innerHTML = '<div class="empty-state">Error loading profile. Pull to refresh.</div>';
    }
}

// ========== ADMIN PAGE ==========
async function loadAdminPage() {
    const adminContent = document.getElementById('admin-content');
    if (!adminContent) return;
    
    // Check admin access
    const currentUser = window.auth?.currentUser;
    const adminEmail = 'theprimestarventures@gmail.com';
    
    if (!currentUser || currentUser.email !== adminEmail) {
        adminContent.innerHTML = '<div class="empty-state">Access Denied</div>';
        return;
    }
    
    adminContent.innerHTML = '<div class="loading-spinner"></div>';
    
    try {
        // Fetch admin stats
        const { data: statsData, error: statsError } = await supabase.rpc('admin_get_stats');
        
        if (statsError) throw statsError;
        
        const stats = statsData.stats;
        
        adminContent.innerHTML = `
            <div class="admin-dashboard">
                <h3>📊 Dashboard Overview</h3>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${stats.total_users || 0}</div>
                        <div class="stat-label">Total Users</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.total_gigs || 0}</div>
                        <div class="stat-label">Total Gigs</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.total_credits_purchased || 0}</div>
                        <div class="stat-label">Credits Sold</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">₦${(stats.total_revenue || 0).toLocaleString()}</div>
                        <div class="stat-label">Revenue</div>
                    </div>
                </div>
                
                <h3 style="margin-top: 24px;">📈 User Growth</h3>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${stats.joined_today || 0}</div>
                        <div class="stat-label">Joined Today</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.joined_week || 0}</div>
                        <div class="stat-label">Joined This Week</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.joined_month || 0}</div>
                        <div class="stat-label">Joined This Month</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.joined_year || 0}</div>
                        <div class="stat-label">Joined This Year</div>
                    </div>
                </div>
                
                <h3 style="margin-top: 24px;">⚡ Quick Actions</h3>
                <div class="admin-actions">
                    <button id="admin-gift-credits-btn" class="admin-btn-primary">🎁 Gift Credits</button>
                    <button id="admin-service-requests-btn" class="admin-btn-secondary">📋 Service Requests (${stats.pending_requests || 0})</button>
                    <button id="admin-view-users-btn" class="admin-btn-secondary">👥 View Users</button>
                </div>
                
                <div id="admin-action-panel" style="margin-top: 20px;"></div>
            </div>
        `;
        
        // Add button listeners
        document.getElementById('admin-gift-credits-btn')?.addEventListener('click', () => showGiftCreditsUI());
        document.getElementById('admin-service-requests-btn')?.addEventListener('click', () => showServiceRequestsUI());
        document.getElementById('admin-view-users-btn')?.addEventListener('click', () => showUsersListUI());
        
        // Refresh button
        document.getElementById('admin-refresh-btn')?.addEventListener('click', () => loadAdminPage());
        
    } catch (error) {
        console.error('loadAdminPage error:', error);
        adminContent.innerHTML = '<div class="empty-state">Error loading admin page</div>';
    }
}

// Helper UI functions (we'll fill these in next steps)
function showGiftCreditsUI() {
    const panel = document.getElementById('admin-action-panel');
    panel.innerHTML = `
        <h4>🎁 Gift Credits to User</h4>
        <input type="email" id="admin-target-email" placeholder="User Email Address" class="search-input" style="margin-bottom: 12px;">
        <button id="admin-lookup-user-btn" class="admin-btn-secondary" style="margin-bottom: 12px;">🔍 Lookup User</button>
        <div id="admin-user-info" style="display: none; margin-bottom: 12px; padding: 12px; background: var(--bg-tertiary); border-radius: 12px;"></div>
        <input type="number" id="admin-credits-amount" placeholder="Credits Amount" class="search-input" style="margin-bottom: 12px;" min="1" value="5">
        <button id="admin-send-credits-btn" class="admin-btn-primary" disabled>Send Credits</button>
        <p style="font-size: 12px; color: var(--text-secondary); margin-top: 8px;">Enter user's email and click Lookup.</p>
    `;
    
    let foundUserId = null;
    
    document.getElementById('admin-lookup-user-btn')?.addEventListener('click', async () => {
        const email = document.getElementById('admin-target-email').value.trim();
        if (!email) {
            window.showToast('Please enter an email address', 'error');
            return;
        }
        
        const lookupBtn = document.getElementById('admin-lookup-user-btn');
        lookupBtn.textContent = '⏳ Looking up...';
        lookupBtn.disabled = true;
        
        try {
            const { data, error } = await supabase.rpc('admin_find_user_by_email', {
                p_email: email
            });
            
            if (error) throw error;
            
            const userInfo = document.getElementById('admin-user-info');
            const sendBtn = document.getElementById('admin-send-credits-btn');
            
            if (data.success) {
                foundUserId = data.user_id;
                userInfo.style.display = 'block';
                userInfo.innerHTML = `
                    ✅ <strong>${data.display_name}</strong><br>
                    Current Credits: ${data.current_credits}
                `;
                sendBtn.disabled = false;
                window.showToast('User found!', 'success');
            } else {
                userInfo.style.display = 'block';
                userInfo.innerHTML = `❌ ${data.message}`;
                sendBtn.disabled = true;
                foundUserId = null;
            }
        } catch (error) {
            console.error('Lookup error:', error);
            window.showToast('Error looking up user', 'error');
        } finally {
            lookupBtn.textContent = '🔍 Lookup User';
            lookupBtn.disabled = false;
        }
    });
    
    document.getElementById('admin-send-credits-btn')?.addEventListener('click', async () => {
        const credits = parseInt(document.getElementById('admin-credits-amount').value);
        
        if (!foundUserId || credits < 1) {
            window.showToast('Please lookup a user and enter valid credits', 'error');
            return;
        }
        
        const sendBtn = document.getElementById('admin-send-credits-btn');
        sendBtn.textContent = '⏳ Sending...';
        sendBtn.disabled = true;
        
        try {
            const { data, error } = await supabase.rpc('admin_add_credits', {
                p_target_user_id: foundUserId,
                p_credits: credits,
                p_notes: 'Admin gift'
            });
            
            if (error) throw error;
            
            if (data.success) {
                window.showToast(`✅ Sent ${credits} credits! New balance: ${data.new_credits}`, 'success');
                document.getElementById('admin-user-info').innerHTML = `
                    ✅ Credits sent!<br>
                    New Balance: ${data.new_credits}
                `;
                document.getElementById('admin-credits-amount').value = 5;
            } else {
                window.showToast(data.message, 'error');
            }
        } catch (error) {
            console.error('Send credits error:', error);
            window.showToast('Error sending credits', 'error');
        } finally {
            sendBtn.textContent = 'Send Credits';
            sendBtn.disabled = false;
        }
    });
}

async function showServiceRequestsUI() {
    const panel = document.getElementById('admin-action-panel');
    panel.innerHTML = '<div class="loading-spinner"></div>';
    
    try {
        // Fetch pending requests
        const { data: requests, error } = await supabase
            .from('service_requests')
            .select('*')
            .eq('status', 'pending')
            .order('created_at', { ascending: false });
        
        if (error) throw error;
        
        if (!requests || requests.length === 0) {
            panel.innerHTML = '<div class="empty-state">No pending service requests</div>';
            return;
        }
        
        let html = `<h4>📋 Pending Service Requests (${requests.length})</h4><div style="max-height: 400px; overflow-y: auto;">`;
        
        requests.forEach(req => {
            html += `
                <div style="padding: 16px; margin-bottom: 12px; background: var(--bg-tertiary); border-radius: 12px;">
                    <div style="font-weight: 600; margin-bottom: 4px;">${req.requested_service}</div>
                    <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 12px;">Requested by: ${req.user_email || req.user_id}</div>
                    <div style="display: flex; gap: 8px;">
                        <button class="approve-request-btn" data-id="${req.id}" data-service="${req.requested_service}" style="flex: 1; padding: 10px; background: var(--success-green); color: white; border: none; border-radius: 8px;">✅ Approve</button>
                        <button class="edit-request-btn" data-id="${req.id}" data-service="${req.requested_service}" style="flex: 1; padding: 10px; background: var(--accent-orange); color: white; border: none; border-radius: 8px;">✏️ Edit</button>
                        <button class="reject-request-btn" data-id="${req.id}" style="flex: 1; padding: 10px; background: var(--error-red); color: white; border: none; border-radius: 8px;">❌ Reject</button>
                    </div>
                </div>
            `;
        });
        
        html += '</div>';
        panel.innerHTML = html;
        
        // Add button listeners
        document.querySelectorAll('.approve-request-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                await processServiceRequest(btn.dataset.id, 'approve', btn.dataset.service);
            });
        });
        
        document.querySelectorAll('.reject-request-btn').forEach(btn => {
            btn.addEventListener('click', async () => {
                await processServiceRequest(btn.dataset.id, 'reject');
            });
        });
        
        document.querySelectorAll('.edit-request-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                showEditRequestUI(btn.dataset.id, btn.dataset.service);
            });
        });
        
    } catch (error) {
        console.error('showServiceRequestsUI error:', error);
        panel.innerHTML = '<div class="empty-state">Error loading requests</div>';
    }
}

function showEditRequestUI(requestId, currentName) {
    const panel = document.getElementById('admin-action-panel');
    panel.innerHTML = `
        <h4>✏️ Edit Service Request</h4>
        <p style="margin-bottom: 12px; color: var(--text-secondary);">Original: "${currentName}"</p>
        <input type="text" id="edit-service-name" value="${currentName}" class="search-input" style="margin-bottom: 16px;">
        <div style="display: flex; gap: 8px;">
            <button id="save-edit-btn" class="admin-btn-primary" style="flex: 1;">Save Changes</button>
            <button id="cancel-edit-btn" class="admin-btn-secondary" style="flex: 1;">Cancel</button>
        </div>
    `;
    
    document.getElementById('save-edit-btn')?.addEventListener('click', async () => {
        const newName = document.getElementById('edit-service-name').value.trim();
        if (!newName) {
            window.showToast('Service name cannot be empty', 'error');
            return;
        }
        await processServiceRequest(requestId, 'edit', newName);
    });
    
    document.getElementById('cancel-edit-btn')?.addEventListener('click', () => {
        showServiceRequestsUI();
    });
}

async function processServiceRequest(requestId, action, editedName = null) {
    try {
        const { data, error } = await supabase.rpc('admin_process_service_request', {
            p_request_id: requestId,
            p_action: action,
            p_edited_name: editedName
        });
        
        if (error) throw error;
        
        if (data.success) {
            window.showToast(`Request ${action}ed successfully!`, 'success');
            
            // Send push notification to user
            if (data.user_id) {
                let message = '';
                if (action === 'approve') message = `✅ Your service "${editedName || 'request'}" was approved!`;
                else if (action === 'reject') message = `❌ Your service request was not approved.`;
                else if (action === 'edit') message = `✏️ Your service request was updated to "${editedName}".`;
                
                await sendPushNotification(
                    data.user_id,
                    'Service Request Update',
                    message,
                    '/profile'
                );
            }
            
            // Refresh the list
            showServiceRequestsUI();
        } else {
            window.showToast(data.message, 'error');
        }
    } catch (error) {
        console.error('processServiceRequest error:', error);
        window.showToast('Error processing request', 'error');
    }
}

async function showUsersListUI() {
    const panel = document.getElementById('admin-action-panel');
    panel.innerHTML = '<div class="loading-spinner"></div>';
    
    try {
        const { data, error } = await supabase.rpc('admin_get_users', {
            p_limit: 50,
            p_offset: 0
        });
        
        if (error) throw error;
        
        if (!data.success) {
            throw new Error(data.message);
        }
        
        const users = data.users || [];
        
        if (users.length === 0) {
            panel.innerHTML = '<div class="empty-state">No users found</div>';
            return;
        }
        
        let html = `<h4>👥 Users (${users.length})</h4><div style="max-height: 400px; overflow-y: auto;">`;
        
        users.forEach(user => {
            const joinDate = user.created_at ? new Date(user.created_at).toLocaleDateString() : 'N/A';
            const lastActive = user.last_active ? new Date(user.last_active).toLocaleDateString() : 'N/A';
            
            html += `
                <div style="padding: 16px; margin-bottom: 12px; background: var(--bg-tertiary); border-radius: 12px;">
                    <div style="font-weight: 600; margin-bottom: 4px;">${user.display_name || 'Anonymous'}</div>
                    <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">📞 ${user.phone || 'No phone'}</div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 13px; margin-bottom: 8px;">
                        <div>💰 Credits: ${user.credits || 0}</div>
                        <div>📊 Gigs: ${user.gig_count || 0}</div>
                        <div>⭐ Rating: ${(user.rating || 0).toFixed(1)} (${user.review_count || 0})</div>
                        <div>📅 Joined: ${joinDate}</div>
                    </div>
                    <button class="quick-gift-btn" data-user-id="${user.user_id}" data-user-name="${user.display_name || 'User'}" style="width: 100%; padding: 8px; background: var(--accent-orange); color: white; border: none; border-radius: 8px;">🎁 Quick Gift Credits</button>
                </div>
            `;
        });
        
        html += '</div>';
        panel.innerHTML = html;
        
        // Add quick gift listeners
        document.querySelectorAll('.quick-gift-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                const userId = btn.dataset.userId;
                const userName = btn.dataset.userName;
                showQuickGiftUI(userId, userName);
            });
        });
        
    } catch (error) {
        console.error('showUsersListUI error:', error);
        panel.innerHTML = '<div class="empty-state">Error loading users</div>';
    }
}

function showQuickGiftUI(userId, userName) {
    const panel = document.getElementById('admin-action-panel');
    panel.innerHTML = `
        <h4>🎁 Gift Credits to ${userName}</h4>
        <input type="number" id="quick-credits-amount" placeholder="Credits Amount" class="search-input" style="margin-bottom: 16px;" min="1" value="5">
        <div style="display: flex; gap: 8px;">
            <button id="quick-send-btn" class="admin-btn-primary" style="flex: 1;">Send Credits</button>
            <button id="quick-back-btn" class="admin-btn-secondary" style="flex: 1;">Back to Users</button>
        </div>
    `;
    
    document.getElementById('quick-send-btn')?.addEventListener('click', async () => {
        const credits = parseInt(document.getElementById('quick-credits-amount').value);
        if (credits < 1) {
            window.showToast('Please enter valid credits', 'error');
            return;
        }
        
        const sendBtn = document.getElementById('quick-send-btn');
        sendBtn.textContent = '⏳ Sending...';
        sendBtn.disabled = true;
        
        try {
            const { data, error } = await supabase.rpc('admin_add_credits', {
                p_target_user_id: userId,
                p_credits: credits,
                p_notes: 'Admin quick gift'
            });
            
            if (error) throw error;
            
            if (data.success) {
                window.showToast(`✅ Sent ${credits} credits to ${userName}!`, 'success');
                showUsersListUI();
            } else {
                window.showToast(data.message, 'error');
            }
        } catch (error) {
            console.error('Quick gift error:', error);
            window.showToast('Error sending credits', 'error');
        } finally {
            sendBtn.textContent = 'Send Credits';
            sendBtn.disabled = false;
        }
    });
    
    document.getElementById('quick-back-btn')?.addEventListener('click', () => {
        showUsersListUI();
    });
}

// Expose to window
window.loadAdminPage = loadAdminPage;

async function editServices() {
    let selectedServices = [...(window.currentUserData?.services || [])];
    
    // Show bottom sheet with loading state
    window.openBottomSheet(`
        <h3 style="margin-bottom: 16px;">Edit Your Services</h3>
        <div id="edit-services-container" style="max-height: 350px; overflow-y: auto;">
            <div class="loading-spinner"></div>
        </div>
        <div class="service-request-section" style="margin-top: 20px; padding-top: 16px; border-top: 1px solid var(--border-light);">
            <p style="font-size: 14px; color: var(--text-secondary); margin-bottom: 8px;">Can't find your service?</p>
            <div style="display: flex; gap: 8px;">
                <input type="text" id="edit-custom-service-input" placeholder="Type your service here" class="search-input" style="flex: 1; margin-bottom: 0;">
                <button id="edit-request-service-btn" class="onboarding-btn-secondary" style="padding: 0 16px; white-space: nowrap;">Request</button>
            </div>
            <div id="edit-requested-services-list" style="margin-top: 12px;"></div>
        </div>
        <button id="save-services" class="btn-primary" style="width: 100%; margin-top: 16px;">Save Changes</button>
    `);
    
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
                        <span class="category-arrow" id="edit-arrow-${category.id}" style="font-size: 12px; transition: transform 0.2s;">▶</span>
                        <span>${category.emoji} ${category.category_name}</span>
                        <span style="margin-left: auto; font-size: 12px; color: var(--text-secondary);">${categoryServices.length}</span>
                    </div>
                    <div class="category-services" id="edit-category-${category.id}" style="display: none; padding-left: 24px; padding-bottom: 8px;">
            `;
            
            categoryServices.forEach(service => {
                const isSelected = selectedServices.includes(service.service_name);
                html += `
                    <div class="edit-service-option ${isSelected ? 'selected' : ''}" data-service="${service.service_name}" style="padding: 10px 12px; margin-bottom: 4px; background: ${isSelected ? 'var(--accent-orange)' : 'var(--bg-secondary)'}; color: ${isSelected ? 'white' : 'var(--text-primary)'}; border-radius: 8px; cursor: pointer;">
                        ${service.display_name}
                    </div>
                `;
            });
            
            html += `
                    </div>
                </div>
            `;
        });
        
        const container = document.getElementById('edit-services-container');
        if (container) {
            container.innerHTML = html || '<p style="color: var(--text-secondary); text-align: center;">No services available</p>';
        }
        
        // Add category toggle handlers
        document.querySelectorAll('.category-header').forEach(header => {
            header.addEventListener('click', () => {
                const categoryId = header.dataset.categoryId;
                const servicesDiv = document.getElementById(`edit-category-${categoryId}`);
                const arrow = document.getElementById(`edit-arrow-${categoryId}`);
                
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
        document.querySelectorAll('.edit-service-option').forEach(opt => {
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
        const container = document.getElementById('edit-services-container');
        if (container) {
            container.innerHTML = '<p style="color: var(--error-red); text-align: center;">Error loading services. Please try again.</p>';
        }
    }
    
    // ========== SERVICE REQUEST HANDLER ==========
    let requestedServices = [];
    
    // Update requested services display
    function updateEditRequestedDisplay() {
        const listDiv = document.getElementById('edit-requested-services-list');
        if (listDiv && requestedServices.length > 0) {
            listDiv.innerHTML = requestedServices.map(s => `
                <span style="display: inline-block; background: var(--bg-tertiary); padding: 4px 12px; border-radius: 20px; font-size: 12px; margin-right: 8px; margin-bottom: 8px;">⏳ ${s} (Pending)</span>
            `).join('');
        } else if (listDiv) {
            listDiv.innerHTML = '';
        }
    }
    updateEditRequestedDisplay();
    
    document.getElementById('edit-request-service-btn')?.addEventListener('click', async () => {
        const input = document.getElementById('edit-custom-service-input');
        const serviceName = input.value.trim();
        
        if (!serviceName) {
            window.showToast('Please enter a service name', 'error');
            return;
        }
        
        if (requestedServices.includes(serviceName)) {
            window.showToast('You already requested this service', 'error');
            return;
        }
        
        requestedServices.push(serviceName);
        updateEditRequestedDisplay();
        
        // Save to Supabase
        try {
            const { error } = await supabase
                .from('service_requests')
                .insert({
                    user_id: window.auth.currentUser.uid,
                    user_email: window.auth.currentUser.email,
                    requested_service: serviceName,
                    status: 'pending'
                });
            
            if (error) throw error;
            
            input.value = '';
            window.showToast('Service requested! Admin will review.', 'success');
        } catch (error) {
            console.error('Service request error:', error);
            window.showToast('Error submitting request', 'error');
        }
    });
    
    // Save services button
    document.getElementById('save-services')?.addEventListener('click', async () => {
        try {
            const servicesString = selectedServices.join(', ');
            
            const { data, error } = await supabase.rpc('update_provider_services', {
                p_user_id: window.auth.currentUser.uid,
                p_services: servicesString
            });
            
            if (error) throw error;
            
            if (!data.success) {
                throw new Error(data.message);
            }
            
            if (window.currentUserData) {
                window.currentUserData.services = selectedServices;
            }
            
            window.closeBottomSheet();
            window.showToast('Services updated!');
            loadProfile();
            
        } catch (error) {
            console.error('editServices error:', error);
            window.showToast(error.message || 'Error updating services', 'error');
        }
    });
}

async function addPortfolioImage() {
    console.log('addPortfolioImage function called');
    try {
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                window.showToast('Uploading...');
                const url = await uploadImage(file, 'portfolio');
                if (!url) {
                    window.showToast('Upload failed', 'error');
                    return;
                }
                
                // Get current portfolio from Supabase
                const { data: profile, error: fetchError } = await supabase
                    .from('provider_profiles')
                    .select('portfolio')
                    .eq('user_id', window.auth.currentUser.uid)
                    .single();
                
                if (fetchError) {
                    console.error('Fetch portfolio error:', fetchError);
                    window.showToast('Error fetching portfolio', 'error');
                    return;
                }
                
                const currentPortfolio = profile.portfolio || [];
                if (currentPortfolio.length >= 15) {
                    window.showToast('Maximum 15 images. Delete some first.', 'error');
                    return;
                }
                
                currentPortfolio.push(url);
                
                // Update Supabase
                const { error: updateError } = await supabase
                    .from('provider_profiles')
                    .update({ portfolio: currentPortfolio })
                    .eq('user_id', window.auth.currentUser.uid);
                
                if (updateError) {
                    console.error('Portfolio update error:', updateError);
                    window.showToast('Error updating portfolio', 'error');
                    return;
                }
                
                // Update in-memory currentUserData
                if (window.currentUserData) {
                    window.currentUserData.portfolio = currentPortfolio;
                }
                
                window.showToast('Portfolio updated!');
                loadProfile();
            }
        };
        
        input.click();
    } catch (error) {
        console.error('addPortfolioImage error:', error);
        window.showToast('Error adding image', 'error');
    }
}

async function editProfile() {
    try {
        const user = await getSingleProfileFromSupabase(window.auth.currentUser.uid);
        if (!user) {
            window.showToast('Error loading profile', 'error');
            return;
        }
        window.openBottomSheet(`
            <h3 style="margin-bottom: 16px;">Edit Profile</h3>
            <input type="text" id="edit-name" value="${user.displayName || ''}" placeholder="Name" class="search-input" style="margin-bottom: 12px;">
            <input type="tel" id="edit-phone" value="${user.phone || ''}" placeholder="Phone" class="search-input" style="margin-bottom: 12px;">
            <textarea id="edit-bio" placeholder="Bio" class="search-input" style="margin-bottom: 12px;">${user.bio || ''}</textarea>
            <input type="text" id="edit-address" value="${user.addressText || ''}" placeholder="Address" class="search-input" style="margin-bottom: 12px;">
            <button id="change-photo-btn" class="btn-secondary" style="width: 100%; margin-bottom: 12px;">Change Profile Photo</button>
            <button id="save-profile" class="btn-primary">Save Changes</button>
        `);
        document.getElementById('change-photo-btn')?.addEventListener('click', async () => {
            const input = document.createElement('input');
            input.type = 'file';
            input.accept = 'image/*';
            input.onchange = async (e) => {
                const file = e.target.files[0];
                if (file) {
                    window.showToast('Uploading...');
                    const url = await uploadImage(file, 'profiles');
                    if (!url) {
                        window.showToast('Upload failed', 'error');
                        return;
                    }
                    
                    // Update Supabase
                    const { error } = await supabase
                        .from('provider_profiles')
                        .update({ photo_url: url })
                        .eq('user_id', window.auth.currentUser.uid);
                    
                    if (error) {
                        console.error('Photo update error:', error);
                        window.showToast('Error updating photo', 'error');
                        return;
                    }
                    
                    // Update Firebase Auth
                    await window.updateProfile(window.auth.currentUser, { photoURL: url });
                    window.showToast('Photo updated!');
                    loadProfile();
                }
            };
            input.click();
        });
        document.getElementById('save-profile')?.addEventListener('click', async () => {
            const updates = {
                display_name: document.getElementById('edit-name').value,
                phone: document.getElementById('edit-phone').value,
                bio: document.getElementById('edit-bio').value,
                address_text: document.getElementById('edit-address').value
            };
            
            try {
                const { error } = await supabase
                    .from('provider_profiles')
                    .update(updates)
                    .eq('user_id', window.auth.currentUser.uid);
                
                if (error) throw error;
                
                await window.updateProfile(window.auth.currentUser, { displayName: updates.display_name });
                window.closeBottomSheet();
                window.showToast('Profile updated!');
                loadProfile();
            } catch (error) {
                console.error('Profile update error:', error);
                window.showToast('Error updating profile', 'error');
            }
        });
    } catch (error) {
        console.error('editProfile error:', error);
        window.showToast('Error editing profile', 'error');
    }
}

const userIds = [...new Set(
            chatsSnapshot.docs.map(doc => {
                const chat = doc.data();
                return chat.participants.find(p => p !== window.auth.currentUser.uid);
            })
        )];
        
        const { data: profiles } = await supabase.rpc('get_chat_users', {
            p_user_ids: userIds
        });
        
        const profilesMap = {};
        profiles.forEach(p => { profilesMap[p.user_id] = p; });
        
        for (const chatDoc of chatsSnapshot.docs) {
            const chat = chatDoc.data();
            const otherId = chat.participants.find(p => p !== window.auth.currentUser.uid);
            const userData = profilesMap[otherId] || {};
            recentUsers.push({ 
                id: otherId, 
                displayName: userData.display_name || 'User',
                services: userData.services,
                chatId: chatDoc.id 
            });
        }

async function showSettings() {
    const settingsScreen = document.getElementById('settings-screen');
    const mainApp = document.getElementById('main-app');
    
    // Hide main app, show settings screen
    if (mainApp) {
        mainApp.style.display = 'none';
    }
    if (settingsScreen) {
        settingsScreen.classList.remove('hidden');
    }
    
    // Get button references
    const logoutBtn = document.getElementById('settings-logout-btn');
    const deactivateBtn = document.getElementById('settings-deactivate-btn');
    const changePasswordBtn = document.getElementById('settings-change-password-btn');
    const closeBtn = document.getElementById('settings-close-btn');
    
    // Remove any existing listeners to prevent duplicates
    const newLogoutBtn = logoutBtn?.cloneNode(true);
    if (newLogoutBtn && logoutBtn) {
        logoutBtn.parentNode.replaceChild(newLogoutBtn, logoutBtn);
        newLogoutBtn.addEventListener('click', async () => {
            // Clean up chat list listener before logout
            if (chatListUnsubscribe) {
                chatListUnsubscribe();
                chatListUnsubscribe = null;
            }
            // Clean up global unread listener
            stopGlobalUnreadListener();   // <-- ADD THIS LINE
            await window.signOut(window.auth);
            window.location.reload();
        });
    }
    
    const newDeactivateBtn = deactivateBtn?.cloneNode(true);
    if (newDeactivateBtn && deactivateBtn) {
        deactivateBtn.parentNode.replaceChild(newDeactivateBtn, deactivateBtn);
        newDeactivateBtn.addEventListener('click', async () => {
            if (confirm('Are you sure? Your account will be deactivated and deleted after 14 days.')) {
                try {
                    // Update Supabase
                    const { error } = await supabase
                        .from('provider_profiles')
                        .update({
                            deactivated_at: new Date().toISOString(),
                            deactivate_expires: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
                        })
                        .eq('user_id', window.auth.currentUser.uid);
                    
                    if (error) throw error;
                    
                    window.showToast('Account deactivated. Will be deleted after 14 days.');
                    await window.signOut(window.auth);
                    window.location.reload();
                } catch (error) {
                    console.error('deactivate error:', error);
                    window.showToast('Error deactivating account', 'error');
                }
            }
        });
    }
    
    const newChangePasswordBtn = changePasswordBtn?.cloneNode(true);
    if (newChangePasswordBtn && changePasswordBtn) {
        changePasswordBtn.parentNode.replaceChild(newChangePasswordBtn, changePasswordBtn);
        newChangePasswordBtn.addEventListener('click', async () => {
            const email = window.auth.currentUser?.email;
            if (email) {
                await window.sendPasswordResetEmail(window.auth, email);
                window.showToast('Password reset email sent! Check your inbox.');
            } else {
                window.showToast('No email found', 'error');
            }
        });
    }
    
    const newCloseBtn = closeBtn?.cloneNode(true);
    if (newCloseBtn && closeBtn) {
        closeBtn.parentNode.replaceChild(newCloseBtn, closeBtn);
        newCloseBtn.addEventListener('click', () => {
            // Hide settings screen, show main app
            if (settingsScreen) {
                settingsScreen.classList.add('hidden');
            }
            if (mainApp) {
                mainApp.style.display = 'block';
            }
        });
    }
}

function hideSettingsScreen() {
    const settingsScreen = document.getElementById('settings-screen');
    const mainApp = document.getElementById('main-app');
    
    if (settingsScreen) {
        settingsScreen.classList.add('hidden');
    }
    if (mainApp) {
        mainApp.style.display = 'block';
    }
}

// ========== INITIALIZE FEATURES (only after appReady) ==========
async function initFeatures() {
    console.log('initFeatures: Starting...');
    
    if (featuresInitialized) {
        console.log('initFeatures: Already initialized, skipping');
        return;
    }
    
    // Double check Firebase is ready
    if (!window.db || !window.auth) {
        console.log('initFeatures: Firebase not ready yet, waiting for appReady');
        return;
    }
    
    featuresInitialized = true;
    console.log('initFeatures: Firebase is ready, initializing...');
    
    // Get DOM elements
    homeFeed = document.getElementById('home-feed');
    searchServiceInput = document.getElementById('search-service-input');
    radiusSlider = document.getElementById('radius-slider');
    radiusValue = document.getElementById('radius-value');
    mapViewBtn = document.getElementById('map-view-btn');
    listViewBtn = document.getElementById('list-view-btn');
    mapContainer = document.getElementById('map-container');
    searchListView = document.getElementById('search-list-view');
    searchListFeed = document.getElementById('search-list-feed');
    chatsList = document.getElementById('chats-list');
    profileContent = document.getElementById('profile-content');
    
    console.log('initFeatures: DOM elements found:', {
        homeFeed: !!homeFeed,
        chatsList: !!chatsList,
        profileContent: !!profileContent
    });

    // Setup pull to refresh
    setupPullToRefresh();
    
    // Run initial data loads with error handling
    
    // Run initial data loads with error handling
    
    try {
        if (homeFeed) {
    await loadHomeFeed(true);  // true = reset/clear existing feed
    setupInfiniteScroll();      // add infinite scroll listener
    console.log('loadHomeFeed completed');
}
    } catch (e) {
        console.error('loadHomeFeed failed:', e);
        if (homeFeed) homeFeed.innerHTML = '<div class="empty-state">Failed to load feed. Pull to refresh.</div>';
    }
    
    try {
        if (searchServiceInput) {
            setupSearch();
            setupSearchInfiniteScroll();
            console.log('setupSearch completed');
        }
    } catch (e) {
        console.error('setupSearch failed:', e);
    }
    
    try {
        if (mapContainer && window.L) {
            await initMap();
            console.log('initMap completed');
        } else {
            console.log('initMap skipped - mapContainer or Leaflet missing');
        }
    } catch (e) {
        console.error('initMap failed:', e);
    }
    
    try {
        if (chatsList) {
            await loadChats();
            startGlobalUnreadListener();   // <-- ADD THIS LINE
            console.log('loadChats completed');
        }
    } catch (e) {
        console.error('loadChats failed:', e);
        if (chatsList) chatsList.innerHTML = '<div class="empty-state">Failed to load chats</div>';
    }
    
    try {
        if (profileContent) {
            await loadProfile();
            console.log('loadProfile completed');
        }
    } catch (e) {
        console.error('loadProfile failed:', e);
        if (profileContent) profileContent.innerHTML = '<div class="empty-state">Failed to load profile</div>';
    }
    
    // Set up navigation event listener for tab changes
    window.addEventListener('navigate', (e) => {
        console.log('Navigate event:', e.detail.page);
        if (e.detail.page === 'home' && homeFeed) {
            loadHomeFeed().catch(err => console.error('Navigate loadHomeFeed error:', err));
        }
        if (e.detail.page === 'chats' && chatsList) {
            loadChats().catch(err => console.error('Navigate loadChats error:', err));
        }
        if (e.detail.page === 'profile' && profileContent) {
            loadProfile().catch(err => console.error('Navigate loadProfile error:', err));
        }
        if (e.detail.page === 'admin') {
            loadAdminPage().catch(err => console.error('Navigate loadAdminPage error:', err));
        }
    });
    
    console.log('initFeatures: All done!');
}

// ========== WAIT FOR appReady EVENT ==========
// IMPORTANT: We ONLY initialize features when appReady fires.
// app-core.js controls this timing to ensure Firebase auth and token refresh complete first.
// This prevents the home feed from loading twice and flickering.

window.addEventListener('appReady', () => {
    console.log('appReady received! Initializing features...');
    setTimeout(() => {
        initFeatures();
    }, 100);
});

// Safety net: If appReady never fires for some reason, initialize after 5 seconds
// This ensures the app doesn't stay broken forever
setTimeout(() => {
    if (!featuresInitialized && window.db && window.auth) {
        console.log('Safety net: Initializing features after timeout');
        initFeatures();
    }
}, 5000);

// ========== ADMIN TAB VISIBILITY ==========
function checkAdminAccess() {
    const adminTab = document.getElementById('admin-tab');
    if (!adminTab) return;
    
    const currentUser = window.auth?.currentUser;
    const adminEmail = 'theprimestarventures@gmail.com';
    
    if (currentUser && currentUser.email === adminEmail) {
        adminTab.classList.remove('hidden');
        console.log('Admin access granted');
    } else {
        adminTab.classList.add('hidden');
    }
}

// Check admin access after auth is ready
setTimeout(() => {
    checkAdminAccess();
}, 1000);

// Expose functions globally
window.loadHomeFeed = loadHomeFeed;
window.loadProfile = loadProfile;
window.loadChats = loadChats;
window.performSearch = performSearch;
window.buyCredits = buyCredits;
window.submitReview = submitReview;
window.registerGig = registerGig;
window.uploadImage = uploadImage;
window.showSettings = showSettings;
window.addPortfolioImage = addPortfolioImage;
