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
    deleteDoc 
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

import { createClient } from 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/+esm';
import { getAuth } from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js';

const SUPABASE_URL = 'https://qifzdrkpxzosdturjpex.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_QfKJ4jT8u_2HuUKmW-xvbQ_9acJvZw-';

const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    accessToken: async () => {
        const auth = getAuth();
        const user = auth.currentUser;
        if (user) {
            return await user.getIdToken(true);
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
            totalRatingSum: profile.total_rating_sum || 0
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
    const monthlyGigs = userData.monthlyGigCount || 0;
    const now = new Date();
    const sevenDaysAgo = new Date(now.setDate(now.getDate() - 7));
    if ((lastGigDate && lastGigDate > sevenDaysAgo) || monthlyGigs >= 3) {
        return { active: true, text: 'Active this week' };
    }
    return { active: false, text: 'Inactive' };
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
    
    // If no user, show spinner instead of error message
    if (!window.auth?.currentUser) {
        homeFeed.innerHTML = '<div class="loading-spinner"></div>';
        // Wait for user to appear (Firebase restore)
        let attempts = 0;
        const maxAttempts = 50; // 2 seconds max (20 * 100ms)
        
        while (!window.auth?.currentUser && attempts < maxAttempts) {
            await new Promise(resolve => setTimeout(resolve, 100));
            attempts++;
        }
        
        // If still no user after waiting, show login message
        if (!window.auth?.currentUser) {
            homeFeed.innerHTML = '<div class="empty-state">Please log in to see providers</div>';
            return;
        }
        
        // User appeared, continue to load feed
        // Reset the feed container and proceed
        homeFeed.innerHTML = '<div class="loading-spinner"></div>';
    }
    
    // Reset if requested
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
    
    // Stop if already loading or no more data
    if (isHomeFeedLoading || !hasMoreHomeFeed) return;
    
    isHomeFeedLoading = true;
    
    try {
        // Get user location - fetch if not available
        if (!currentUserLocation) {
            // Try to get location now
            const location = await new Promise((resolve) => {
                if (!navigator.geolocation) {
                    resolve(null);
                    return;
                }
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        resolve({
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                        });
                    },
                    () => {
                        resolve(null);
                    }
                );
            });
            
            if (!location) {
                homeFeed.innerHTML = '<div class="empty-state">Enable location to see providers near you</div>';
                isHomeFeedLoading = false;
                return;
            }
            
            currentUserLocation = location;
        }
        
        let currentLat = currentUserLocation.lat;
        let currentLng = currentUserLocation.lng;
        
        // Query Supabase with offset pagination
        const { data: providers, error } = await supabase
            .from('provider_locations')
            .select('user_id, lat, lng, rating, last_gig_date')
            .order('rating', { ascending: false })
            .range(homeFeedOffset, homeFeedOffset + HOME_FEED_LIMIT - 1);
        
        if (error) throw error;
        
        // Check if no more providers
        if (!providers || providers.length === 0) {
            hasMoreHomeFeed = false;
            if (homeFeed.children.length === 0 || (homeFeed.children.length === 1 && homeFeed.querySelector('.loading-spinner'))) {
                // Remove spinner first, then show empty state
                const spinner = homeFeed.querySelector('.loading-spinner');
                if (spinner) spinner.remove();
                homeFeed.insertAdjacentHTML('beforeend', '<div class="empty-state">No providers found nearby</div>');
            }
            isHomeFeedLoading = false;
            return;
        }
        
        // Update offset for next load
        homeFeedOffset += providers.length;
        
        // If fewer than limit, no more data
        if (providers.length < HOME_FEED_LIMIT) {
            hasMoreHomeFeed = false;
        }
        
        // Fetch full profiles from Supabase
        const userIds = providers.map(p => p.user_id);
        const profiles = await fetchProviderProfilesFromSupabase(userIds);
        
        // Merge data
        const mergedProviders = providers.map(provider => {
            const profile = profiles[provider.user_id] || {};
            return {
                id: provider.user_id,
                displayName: profile.displayName || 'Anonymous',
                photoURL: profile.photoURL || null,
                rating: profile.rating || provider.rating || 0,
                gigCount: profile.gigCount || 0,
                reviewCount: profile.reviewCount || 0,
                services: profile.services || [],
                distance: calculateDistance(currentLat, currentLng, provider.lat, provider.lng),
                last_gig_date: provider.last_gig_date,
            };
        });
        
        // Sort by distance (closest first)
        mergedProviders.sort((a, b) => a.distance - b.distance);
        
        // Sort active providers first
        mergedProviders.sort((a, b) => {
            const aActive = getActiveStatus(a).active ? 1 : 0;
            const bActive = getActiveStatus(b).active ? 1 : 0;
            return bActive - aActive;
        });
        
        // Filter out the current user so they don't see themselves
        const filteredProviders = mergedProviders.filter(provider => provider.id !== window.auth.currentUser.uid);
        
        // Create HTML for new cards (with async monthly gig count)
        const cardsHtmlArray = await Promise.all(filteredProviders.map(async (user) => {
            const monthlyGigs = await getRolling30DayGigCount(user.id);
            const reviewCount = user.reviewCount || 0;
            
            return `
            <div class="card" data-user-id="${user.id}">
                <div class="card-header">
                    <img class="card-avatar" src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName)}" alt="${user.displayName}">
                    <div class="card-info">
                        <div class="card-name">
                            ${user.displayName}
                            ${getActiveStatus(user).active ? '<span class="active-badge">Active</span>' : ''}
                        </div>
                        <div class="card-rating">
                            <span class="star">★</span> ${(user.rating || 0).toFixed(1)} (${reviewCount})
                        </div>
                    </div>
                </div>
                <div class="card-services">
                    ${(user.services || []).slice(0, 3).map(s => `<span class="service-tag">${s}</span>`).join('')}
                </div>
                <div class="card-stats">
                    <div class="stat-item">📊 ${user.gigCount || 0} gigs total</div>
                    <div class="stat-item">🔥 ${monthlyGigs} gigs this month</div>
                </div>
                <div class="card-distance">📍 ${formatDistance(user.distance)}</div>
            </div>
        `;
        }));
        
        const cardsHtml = cardsHtmlArray.join('');
        
        // SMOOTH TRANSITION: Add cards FIRST, then remove spinner
        // This prevents the empty gap between spinner disappearing and cards appearing
        
        // If this is a reset (first load), remove the spinner after adding cards
        if (reset) {
            homeFeed.insertAdjacentHTML('beforeend', cardsHtml);
            const spinner = homeFeed.querySelector('.loading-spinner');
            if (spinner) spinner.remove();
        } else {
            // For infinite scroll (loading more), just append
            homeFeed.insertAdjacentHTML('beforeend', cardsHtml);
        }
        
        // Attach click listeners to new cards
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
        
        const userWithLocation = { ...user, ...(locationData || {}) };
        const activeStatus = getActiveStatus(userWithLocation);
        window.openBottomSheet(`
            <div style="text-align: center; padding: 8px 0;">
                <img src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || 'User')}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 12px;">
                <h3>${user.displayName || 'Anonymous'}</h3>
                ${activeStatus.active ? '<span class="active-badge">Active this week</span>' : ''}
                <div class="card-rating" style="justify-content: center; margin: 8px 0;">★ ${(user.rating || 0).toFixed(1)} (${user.gigCount || 0} gigs)</div>
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
    
    // Reset pagination if requested
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
    
    // Stop if already loading or no more data
    if (isSearchLoading || !hasMoreSearch) return;
    
    isSearchLoading = true;
    
    try {
        // Get current service and radius
        const service = currentSearchService || searchServiceInput?.value;
        const radiusMeters = (currentRadius || 5) * 1000;
        
        // Get user location - fetch if not available
        if (!currentUserLocation) {
            const location = await new Promise((resolve) => {
                if (!navigator.geolocation) {
                    resolve(null);
                    return;
                }
                navigator.geolocation.getCurrentPosition(
                    (position) => {
                        resolve({
                            lat: position.coords.latitude,
                            lng: position.coords.longitude
                        });
                    },
                    () => {
                        resolve(null);
                    }
                );
            });
            
            if (!location) {
                if (reset && searchListFeed) {
                    searchListFeed.innerHTML = '<div class="empty-state">Enable location to search for providers</div>';
                }
                isSearchLoading = false;
                return;
            }
            currentUserLocation = location;
        }
        
        let currentLat = currentUserLocation.lat;
        let currentLng = currentUserLocation.lng;
        
        // Build Supabase query
        let query = supabase
            .from('provider_locations')
            .select('user_id, lat, lng, rating, last_gig_date')
            .limit(SEARCH_LIMIT);
        
        // Add service filter if selected
        if (service && service !== '') {
            query = query.eq('service', service);
        }
        
        // Add offset for pagination
        query = query.range(searchOffset, searchOffset + SEARCH_LIMIT - 1);
        
        const { data: providers, error } = await query;
        
        if (error) throw error;
        
        // Check if no more providers
        if (!providers || providers.length === 0) {
            hasMoreSearch = false;
            if (reset && searchListFeed && searchListFeed.children.length === 0) {
                searchListFeed.innerHTML = '<div class="empty-state">No providers found. Try a different service or radius.</div>';
            }
            isSearchLoading = false;
            return;
        }
        
        // Update offset for next load
        searchOffset += providers.length;
        
        if (providers.length < SEARCH_LIMIT) {
            hasMoreSearch = false;
        }
        
        // Calculate distance for each provider and filter by radius
        const providersWithDistance = providers.map(provider => {
            const distance = calculateDistance(currentLat, currentLng, provider.lat, provider.lng);
            return { ...provider, distance };
        });
        
        const filteredProviders = providersWithDistance.filter(p => p.distance <= radiusMeters);
        
        // If filtering removed too many, try to load more
        if (filteredProviders.length === 0 && providers.length > 0) {
            isSearchLoading = false;
            await performSearch(false);
            return;
        }
        
        // Fetch full profiles from Supabase
        const userIds = filteredProviders.map(p => p.user_id);
        const profiles = await fetchProviderProfilesFromSupabase(userIds);
        
        // Merge data
        const mergedProviders = filteredProviders.map(provider => {
            const profile = profiles[provider.user_id] || {};
            return {
                id: provider.user_id,
                displayName: profile.displayName || 'Anonymous',
                photoURL: profile.photoURL || null,
                rating: profile.rating || provider.rating || 0,
                gigCount: profile.gigCount || 0,
                reviewCount: profile.reviewCount || 0,
                services: profile.services || [],
                distance: provider.distance,
                last_gig_date: provider.last_gig_date,
            };
        });
        
        // Sort by distance (closest first)
        mergedProviders.sort((a, b) => a.distance - b.distance);
        
        // Sort active providers first
        mergedProviders.sort((a, b) => {
            const aActive = getActiveStatus(a).active ? 1 : 0;
            const bActive = getActiveStatus(b).active ? 1 : 0;
            return bActive - aActive;
        });
        
        // Filter out current user
        const filteredResults = mergedProviders.filter(p => p.id !== window.auth.currentUser?.uid);
        
        // Create HTML for cards (with async monthly gig count)
        const cardsHtmlArray = await Promise.all(filteredResults.map(async (user) => {
            const monthlyGigs = await getRolling30DayGigCount(user.id);
            const reviewCount = user.reviewCount || 0;
            
            return `
            <div class="card" data-user-id="${user.id}">
                <div class="card-header">
                    <img class="card-avatar" src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName)}" alt="${user.displayName}">
                    <div class="card-info">
                        <div class="card-name">
                            ${user.displayName}
                            ${getActiveStatus(user).active ? '<span class="active-badge">Active</span>' : ''}
                        </div>
                        <div class="card-rating">
                            <span class="star">★</span> ${(user.rating || 0).toFixed(1)} (${reviewCount})
                        </div>
                    </div>
                </div>
                <div class="card-services">
                    ${(user.services || []).slice(0, 2).map(s => `<span class="service-tag">${s}</span>`).join('')}
                </div>
                <div class="card-stats">
                    <div class="stat-item">📊 ${user.gigCount || 0} gigs total</div>
                    <div class="stat-item">🔥 ${monthlyGigs} gigs this month</div>
                </div>
                <div class="card-distance">📍 ${formatDistance(user.distance)}</div>
            </div>
        `;
        }));
        
        const cardsHtml = cardsHtmlArray.join('');
        
        // Append to feed
        if (reset) {
            if (searchListFeed) searchListFeed.innerHTML = cardsHtml;
        } else {
            if (searchListFeed) searchListFeed.insertAdjacentHTML('beforeend', cardsHtml);
        }
        
        // Attach click listeners to new cards
        document.querySelectorAll('#search-list-feed .card:not([data-listener])').forEach(card => {
            card.setAttribute('data-listener', 'true');
            card.addEventListener('click', () => {
                window.haptic('light');
                showUserBottomSheet(card.dataset.userId);
            });
        });
        
        // Update map markers if in map view
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
                <img class="card-avatar" src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || 'User')}" alt="${user.displayName}">
                <div class="card-info">
                    <div class="card-name">
                        ${user.displayName || 'Anonymous'}
                        ${getActiveStatus(user).active ? '<span class="active-badge">Active</span>' : ''}
                    </div>
                    <div class="card-rating">★ ${(user.rating || 0).toFixed(1)} (${user.gigCount || 0})</div>
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
async function loadChats() {
    if (!chatsList) return;
    if (!window.db || !window.auth || !window.auth.currentUser) {
        chatsList.innerHTML = '<div class="empty-state">Loading...</div>';
        return;
    }
    
    // Show loading state
    chatsList.innerHTML = '<div class="loading-spinner"></div>';
    
    // Clean up previous listener if exists
    if (chatListUnsubscribe) {
        chatListUnsubscribe();
        chatListUnsubscribe = null;
    }
    
    // Build query
    const chatsRef = collection(window.db, 'chats');
    const q = query(
        chatsRef, 
        where('participants', 'array-contains', window.auth.currentUser.uid),
        orderBy('lastMessageTime', 'desc')
    );
    
    // Set up real-time listener
    chatListUnsubscribe = onSnapshot(q, async (snapshot) => {
        if (snapshot.empty) {
            chatsList.innerHTML = '<div class="empty-state">No messages yet</div>';
            updateMessagesTabBadge(0);
            return;
        }
        
        // Collect all chat data
        const chats = [];
        let totalUnread = 0;
        
        for (const chatDoc of snapshot.docs) {
            const chat = { id: chatDoc.id, ...chatDoc.data() };
            const otherUserId = chat.participants.find(p => p !== window.auth.currentUser.uid);
            
            // Get unread count for current user
            const unreadCount = chat.unreadCount?.[window.auth.currentUser.uid] || 0;
            totalUnread += unreadCount;
            
            // Fetch other user's profile from Supabase
            const userData = await getSingleProfileFromSupabase(otherUserId);
            
            chats.push({ 
                ...chat, 
                otherUser: { id: otherUserId, ...userData },
                unreadCount: unreadCount
            });
        }
        
        // Update badge on Messages tab
        updateMessagesTabBadge(totalUnread);
        
        // Render chat list
        chatsList.innerHTML = chats.map(chat => `
            <div class="chat-item" data-chat-id="${chat.id}" data-user-id="${chat.otherUser.id}">
                <img class="chat-avatar" src="${chat.otherUser.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(chat.otherUser.displayName || 'User')}" alt="">
                <div class="chat-details">
                    <div class="chat-name">
                        ${chat.otherUser.displayName || 'User'}
                        ${chat.unreadCount > 0 ? `<span class="unread-badge">${chat.unreadCount}</span>` : ''}
                    </div>
                    <div class="chat-last-message">${chat.lastMessage || 'No messages'}</div>
                </div>
                <div class="chat-meta">
                    <div class="chat-time">${chat.lastMessageTime ? new Date(chat.lastMessageTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}</div>
                    ${chat.pendingReview ? '<div class="pending-badge">Pending review</div>' : ''}
                </div>
            </div>
        `).join('');
        
        // Attach click listeners
        document.querySelectorAll('.chat-item').forEach(item => {
            item.addEventListener('click', () => openChat(item.dataset.userId, item.dataset.chatId));
        });
        
    }, (error) => {
        console.error('Chat list listener error:', error);
        chatsList.innerHTML = '<div class="empty-state">Error loading chats. Pull to refresh.</div>';
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
        const q = query(messagesRef, orderBy('timestamp', 'asc'));
        currentMessagesUnsubscribe = onSnapshot(q, (snapshot) => {
            messagesDiv.innerHTML = '';
            snapshot.forEach(doc => {
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
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
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
        
        // Find and update the pending gig in Supabase
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
        
        // Update gig status to cancelled_by_client
        const { error: updateError } = await supabase
            .from('gigs')
            .update({
                status: 'cancelled_by_client',
                cancelled_at: new Date().toISOString()
            })
            .eq('client_id', currentUser)
            .eq('provider_id', providerId)
            .eq('status', 'pending_review');
        
        if (updateError) {
            console.error('Error cancelling gig:', updateError);
            window.showToast('Error cancelling gig', 'error');
            return;
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
        // Check for existing pending gig
        const { data: existingGig, error: checkError } = await supabase
            .from('gigs')
            .select('id')
            .eq('provider_id', window.auth.currentUser.uid)
            .eq('client_id', clientId)
            .eq('status', 'pending_review')
            .maybeSingle();
        
        if (existingGig) {
            window.showToast('⚠️ You already have a pending gig with this client. Wait for review.', 'error');
            return;
        }
        
        // Check credits from Supabase
        const { data: profile, error: profileError } = await supabase
            .from('provider_profiles')
            .select('credits')
            .eq('user_id', window.auth.currentUser.uid)
            .single();
        
        if (profileError) throw profileError;
        
        if ((profile.credits || 0) < 1) {
            window.showToast('You need credits to register a gig. Buy credits first.', 'error');
            buyCredits();
            return;
        }
        
        // Create gig in Supabase
        const { error: gigError } = await supabase
            .from('gigs')
            .insert({
                provider_id: window.auth.currentUser.uid,
                client_id: clientId,
                chat_id: chatId,
                status: 'pending_review',
                created_at: new Date().toISOString(),
                expires_at: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
            });
        
        if (gigError) throw gigError;
        
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
        window.showToast('Error registering gig', 'error');
    }
}

// ========== REVIEW SYSTEM ==========
async function submitReview(providerId, clientId, rating, reviewText) {
    try {
        const reviewId = `${clientId}_${providerId}`;
        
        // 1. Insert or update review in Supabase
        const { error: reviewError } = await supabase
            .from('reviews')
            .upsert({
                id: reviewId,
                provider_id: providerId,
                client_id: clientId,
                rating: rating,
                review: reviewText,
                updated_at: new Date().toISOString()
            });
        
        if (reviewError) throw reviewError;
        
        // 2. Get all reviews for this provider to calculate new average
        const { data: allReviews, error: reviewsError } = await supabase
            .from('reviews')
            .select('rating')
            .eq('provider_id', providerId);
        
        if (reviewsError) throw reviewsError;
        
        const sum = allReviews.reduce((acc, r) => acc + r.rating, 0);
        const avgRating = sum / allReviews.length;
        
        // 3. Get current provider profile
        const { data: profile, error: profileError } = await supabase
            .from('provider_profiles')
            .select('credits, gig_count')
            .eq('user_id', providerId)
            .single();
        
        if (profileError) throw profileError;
        
        const newCredits = Math.max(0, (profile.credits || 0) - 1);
        const newGigCount = (profile.gig_count || 0) + 1;
        
        // 4. Check if this is a NEW review or an UPDATE
        const { data: existingReview } = await supabase
            .from('reviews')
            .select('id')
            .eq('id', reviewId)
            .maybeSingle();
        
        const isNewReview = !existingReview;
        
        // 5. Update provider profile
        const updateData = {
            rating: avgRating,
            total_rating_sum: sum,
            credits: newCredits,
            gig_count: newGigCount
        };
        
        // Only increment review_count for NEW reviews
        if (isNewReview) {
            const { data: profile } = await supabase
                .from('provider_profiles')
                .select('review_count')
                .eq('user_id', providerId)
                .single();
            
            updateData.review_count = (profile?.review_count || 0) + 1;
        }
        
        const { error: updateError } = await supabase
            .from('provider_profiles')
            .update(updateData)
            .eq('user_id', providerId);
        
        if (updateError) throw updateError;
        
        // 5. Update provider_locations
        const { error: locationError } = await supabase
            .from('provider_locations')
            .update({
                rating: avgRating,
                gig_count: newGigCount,
                last_gig_date: new Date().toISOString()
            })
            .eq('user_id', providerId);
        
        if (locationError) {
            console.warn('Location update warning:', locationError);
        }
        
        // 6. Update gig status to completed
        const { error: gigError } = await supabase
            .from('gigs')
            .update({
                status: 'completed',
                completed_at: new Date().toISOString()
            })
            .eq('provider_id', providerId)
            .eq('client_id', clientId)
            .eq('status', 'pending_review');
        
        if (gigError) console.warn('Gig status update warning:', gigError);
        
        // 7. Update chat (still in Firestore)
        const chatRef = doc(window.db, 'chats', currentChatId);
        await updateDoc(chatRef, { pendingReview: false });
        
        // 8. Create transaction record
        const { error: txError } = await supabase
            .from('transactions')
            .insert({
                user_id: providerId,
                type: 'gig_used',
                credits: -1,
                created_at: new Date().toISOString()
            });
        
        if (txError) console.warn('Transaction record warning:', txError);
        
        // 9. Notify provider
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
        
        window.showToast(`Review submitted! ${rating} stars. Thank you!`);
        window.haptic('heavy');
        
    } catch (error) {
        console.error('submitReview error:', error);
        window.showToast('Error submitting review', 'error');
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
                            // 1. Get current credits from Supabase
                            const { data: profile, error: fetchError } = await supabase
                                .from('provider_profiles')
                                .select('credits')
                                .eq('user_id', window.auth.currentUser.uid)
                                .single();
                            
                            if (fetchError) throw fetchError;
                            
                            const newCredits = (profile.credits || 0) + credits;
                            
                            // 2. Update credits in Supabase
                            const { error: updateError } = await supabase
                                .from('provider_profiles')
                                .update({ credits: newCredits })
                                .eq('user_id', window.auth.currentUser.uid);
                            
                            if (updateError) throw updateError;
                            
                            // 3. Update in-memory currentUserData
                            if (window.currentUserData) {
                                window.currentUserData.credits = newCredits;
                            }
                            
                            // 4. Record transaction in Supabase
                            const { error: txError } = await supabase
                                .from('transactions')
                                .insert({
                                    user_id: window.auth.currentUser.uid,
                                    type: 'credit_purchase',
                                    credits: credits,
                                    amount: price,
                                    reference: response.reference,
                                    created_at: new Date().toISOString()
                                });
                            
                            if (txError) {
                                console.warn('Transaction record warning:', txError);
                            }
                            
                            window.showToast(`Added ${credits} credits!`);
                            window.haptic('heavy');
                            loadProfile();
                        } catch (error) {
                            console.error('Credit purchase error:', error);
                            window.showToast('Error processing purchase', 'error');
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
                <img class="profile-avatar" src="${profile.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(profile.displayName || 'User')}" alt="" data-user-id="${profile.id}">
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
                    ${(profile.portfolio || []).map(img => `<img src="${img}" class="portfolio-item">`).join('')}
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
            img.addEventListener('click', () => window.openBottomSheet(`<img src="${img.src}" style="width: 100%; border-radius: 20px;">`));
        });
        document.querySelector('.stat[data-stat="rating"]')?.addEventListener('click', () => showReviews(targetId));
        
    } catch (error) {
        console.error('loadProfile error:', error);
        profileContent.innerHTML = '<div class="empty-state">Error loading profile. Pull to refresh.</div>';
    }
}

async function editServices() {
    let selectedServices = [...(window.currentUserData?.services || [])];
    const servicesHtml = window.PRESET_SERVICES.map(service => `
        <div class="service-option" data-service="${service}" style="padding: 12px; background: ${selectedServices.includes(service) ? 'var(--accent-orange)' : 'var(--bg-secondary)'}; color: ${selectedServices.includes(service) ? 'white' : 'var(--text-primary)'}; border-radius: 10px; margin-bottom: 8px; cursor: pointer;">
            ${service}
        </div>
    `).join('');
    window.openBottomSheet(`
        <h3 style="margin-bottom: 16px;">Edit Your Services</h3>
        <div id="services-list" style="max-height: 400px; overflow-y: auto;">${servicesHtml}</div>
        <button id="save-services" class="btn-primary" style="width: 100%; margin-top: 16px;">Save Changes</button>
    `);
    const serviceOptions = document.querySelectorAll('.service-option');
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
        });
    });
    document.getElementById('save-services')?.addEventListener('click', async () => {
        try {
            const servicesString = selectedServices.join(', ');
            
            // 1. Update provider_profiles
            const { error: profileError } = await supabase
                .from('provider_profiles')
                .update({ services: servicesString })
                .eq('user_id', window.auth.currentUser.uid);
            
            if (profileError) throw profileError;
            
            // 2. Update provider_locations (for search/filtering)
            const { error: locationError } = await supabase
                .from('provider_locations')
                .update({ services: servicesString })
                .eq('user_id', window.auth.currentUser.uid);
            
            // Don't throw if location doesn't exist yet — just log it
            if (locationError) {
                console.warn('Location services sync warning (user may not have location yet):', locationError);
            }
            
            // 3. Update in-memory currentUserData
            if (window.currentUserData) {
                window.currentUserData.services = selectedServices;
            }
            
            window.closeBottomSheet();
            window.showToast('Services updated!');
            loadProfile();
        } catch (error) {
            console.error('editServices error:', error);
            window.showToast('Error updating services', 'error');
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

async function showRecentChatsForGig() {
    try {
        const chatsRef = collection(window.db, 'chats');
        const q = query(
            chatsRef,
            where('participants', 'array-contains', window.auth.currentUser.uid),
            where('lastMessageTime', '>=', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
        );
        const chatsSnapshot = await getDocs(q);
        const recentUsers = [];
        for (const chatDoc of chatsSnapshot.docs) {
            const chat = chatDoc.data();
            const otherId = chat.participants.find(p => p !== window.auth.currentUser.uid);
            const userData = await getSingleProfileFromSupabase(otherId);
            recentUsers.push({ id: otherId, ...userData, chatId: chatDoc.id });
        }
        if (recentUsers.length === 0) {
            window.showToast('No recent chats found');
            return;
        }
        window.openBottomSheet(`
            <h3 style="margin-bottom: 16px;">Select a client you worked with</h3>
            ${recentUsers.map(u => `
                <button class="recent-client-btn" data-user-id="${u.id}" data-chat-id="${u.chatId}" style="width: 100%; padding: 16px; margin-bottom: 8px; background: var(--bg-secondary); border: none; border-radius: 12px; text-align: left;">
                    ${u.displayName || 'User'} - ${u.services ? u.services[0] : ''}
                </button>
            `).join('')}
        `);
        document.querySelectorAll('.recent-client-btn').forEach(btn => {
            btn.addEventListener('click', () => {
                window.closeBottomSheet();
                registerGig(btn.dataset.chatId, btn.dataset.userId);
            });
        });
    } catch (error) {
        console.error('showRecentChatsForGig error:', error);
        window.showToast('Error loading recent chats', 'error');
    }
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
