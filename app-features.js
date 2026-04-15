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
            .select('user_id, display_name, photo_url, bio, phone, address_text, services, portfolio, credits, gig_count, rating, review_count')
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
            .select('user_id, display_name, photo_url, bio, phone, address_text, services, portfolio, credits, gig_count, rating, total_rating_sum, review_count')
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

// ========== ADMIN STATS HELPER ==========
async function incrementAdminStats(field, amount = 1) {
    try {
        const statsRef = doc(window.db, 'admin_stats', 'stats');
        const statsSnap = await getDoc(statsRef);
        
        if (!statsSnap.exists()) {
            // Create initial stats document
            await setDoc(statsRef, {
                totalUsers: field === 'totalUsers' ? amount : 0,
                totalGigs: field === 'totalGigs' ? amount : 0,
                totalCreditsPurchased: field === 'totalCreditsPurchased' ? amount : 0,
                totalRevenue: field === 'totalRevenue' ? amount : 0,
                pendingRequests: field === 'pendingRequests' ? amount : 0,
                usersJoinedToday: field === 'totalUsers' ? amount : 0,
                usersJoinedWeek: field === 'totalUsers' ? amount : 0,
                usersJoinedMonth: field === 'totalUsers' ? amount : 0,
                usersJoinedYear: field === 'totalUsers' ? amount : 0,
                lastUpdated: new Date().toISOString()
            });
            console.log('✅ Admin stats document created');
            return;
        }
        
        // Increment the field
        await updateDoc(statsRef, {
            [field]: increment(amount),
            lastUpdated: new Date().toISOString()
        });
        console.log(`✅ Admin stats: ${field} +${amount}`);
    } catch (error) {
        console.error('❌ incrementAdminStats error:', error);
    }
}

// ========== BATCH FETCH USERS FROM FIRESTORE ==========
async function batchFetchUsersFromFirestore(userIds) {
    if (!userIds || userIds.length === 0) return {};
    
    try {
        const usersMap = {};
        
        // Firestore limits to 30 items per batch
        const batchSize = 30;
        for (let i = 0; i < userIds.length; i += batchSize) {
            const batch = userIds.slice(i, i + batchSize);
            
            const promises = batch.map(async (userId) => {
                const userRef = doc(window.db, 'users', userId);
                const userSnap = await getDoc(userRef);
                if (userSnap.exists()) {
                    const data = userSnap.data();
                    
                    // Get fresh counters (with lazy cleanup)
                    let gigsLast7Days = data.gigsLast7Days || 0;
                    let gigsLast30Days = data.gigsLast30Days || 0;
                    
                    if (typeof window.recalculateStaleCounters === 'function') {
                        const fresh = await window.recalculateStaleCounters(userId);
                        if (fresh) {
                            gigsLast7Days = fresh.gigsLast7Days;
                            gigsLast30Days = fresh.gigsLast30Days;
                        }
                    }
                    
                    const hasCompletedGigs = (data.gigCount || 0) > 0;
                    const isActive = hasCompletedGigs && ((gigsLast7Days >= 1) || (gigsLast30Days >= 3));
                    
                    usersMap[userId] = {
                        gigsLast30Days: gigsLast30Days,
                        isActive: isActive,
                        hasCompletedGigs: hasCompletedGigs
                    };
                } else {
                    usersMap[userId] = {
                        gigsLast30Days: 0,
                        isActive: false,
                        hasCompletedGigs: false
                    };
                }
            });
            
            await Promise.all(promises);
        }
        
        return usersMap;
    } catch (error) {
        console.error('❌ batchFetchUsersFromFirestore error:', error);
        return {};
    }
}

// ========== PROVIDER CACHE (LocalStorage) ==========
const CACHE_PREFIX = 'provider_';
const CACHE_EXPIRY_DAYS = 7; // Cache expires after 7 days

function getCachedProvider(userId) {
    try {
        const cached = localStorage.getItem(`${CACHE_PREFIX}${userId}`);
        if (!cached) return null;
        
        const data = JSON.parse(cached);
        const cacheAge = Date.now() - data.cachedAt;
        const maxAge = CACHE_EXPIRY_DAYS * 24 * 60 * 60 * 1000;
        
        if (cacheAge > maxAge) {
            localStorage.removeItem(`${CACHE_PREFIX}${userId}`);
            return null;
        }
        
        return data;
    } catch (e) {
        console.warn('Cache read error:', e);
        return null;
    }
}

function setCachedProvider(userId, data) {
    try {
        const cacheData = {
            ...data,
            cachedAt: Date.now()
        };
        localStorage.setItem(`${CACHE_PREFIX}${userId}`, JSON.stringify(cacheData));
    } catch (e) {
        console.warn('Cache write error:', e);
    }
}

function updateBioInDOM(bio, elementId = null) {
    const bioElement = document.querySelector('#profile-bio-text');
    if (bioElement) {
        const newBio = bio || '';
        if (bioElement.textContent !== newBio) {
            bioElement.style.transition = 'opacity 0.2s ease';
            bioElement.style.opacity = '0';
            setTimeout(() => {
                bioElement.textContent = newBio;
                bioElement.style.opacity = '1';
            }, 100);
        }
    }
}

function updateActiveBadgeInDOM(active, elementId = null) {
    const existingBadge = document.querySelector('.active-badge-in-sheet');
    const headerDiv = document.querySelector('#bottom-sheet-header');
    
    if (active) {
        if (!existingBadge && headerDiv) {
            const badge = document.createElement('span');
            badge.className = 'active-badge active-badge-in-sheet';
            badge.textContent = 'Active this week';
            badge.style.marginLeft = '8px';
            headerDiv.appendChild(badge);
        }
    } else {
        if (existingBadge) {
            existingBadge.remove();
        }
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
window.currentChatId = null;
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
let currentSheetAbortController = null;
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

// ========== HOME FEED SKELETONS ==========
// Legacy wrapper for backward compatibility
function showHomeFeedSkeletons(count = 5) {
    showSkeletons('home', count);
}

// ========== UNIFIED SKELETON SYSTEM ==========
function showSkeletons(type, count = 5) {
    const containers = {
        home: document.getElementById('home-feed'),
        chat: document.getElementById('chats-list'),
        profile: document.getElementById('profile-content'),
        search: document.getElementById('search-list-feed')
    };
    
    const container = containers[type];
    if (!container) return;
    
    const templates = {
        home: (count) => {
            let html = '';
            for (let i = 0; i < count; i++) {
                html += `
                    <div class="skeleton-card">
                        <div class="skeleton-header">
                            <div class="skeleton-avatar"></div>
                            <div class="skeleton-info">
                                <div class="skeleton-line medium"></div>
                                <div class="skeleton-line short"></div>
                            </div>
                        </div>
                        <div class="skeleton-tags">
                            <div class="skeleton-tag"></div>
                            <div class="skeleton-tag"></div>
                            <div class="skeleton-tag"></div>
                        </div>
                        <div class="skeleton-stats">
                            <div class="skeleton-stat"></div>
                            <div class="skeleton-stat"></div>
                        </div>
                        <div class="skeleton-line short"></div>
                    </div>
                `;
            }
            return html;
        },
        chat: (count) => {
            let html = '';
            for (let i = 0; i < count; i++) {
                html += `
                    <div class="skeleton-chat-item">
                        <div class="skeleton-avatar"></div>
                        <div class="skeleton-chat-info">
                            <div class="skeleton-line medium"></div>
                            <div class="skeleton-line short"></div>
                        </div>
                        <div class="skeleton-chat-meta">
                            <div class="skeleton-line short"></div>
                        </div>
                    </div>
                `;
            }
            return html;
        },
        profile: () => {
            return `
                <div class="skeleton-profile-container" style="padding: 0 16px 20px;">
                    <!-- Profile Header -->
                    <div style="text-align: center; padding: 24px 0 16px; border-bottom: 1px solid var(--border-light);">
                        <div class="skeleton-avatar large" style="width: 100px; height: 100px; margin: 0 auto 12px; border-radius: 50%; background: var(--bg-tertiary);"></div>
                        <div class="skeleton-line medium" style="margin: 0 auto 8px; width: 180px; height: 22px; background: var(--bg-tertiary); border-radius: 4px;"></div>
                        <div class="skeleton-line short" style="margin: 0 auto 12px; width: 120px; height: 14px; background: var(--bg-tertiary); border-radius: 4px;"></div>
                        <div class="skeleton-line short" style="margin: 0 auto; width: 80px; height: 20px; background: var(--bg-tertiary); border-radius: 20px;"></div>
                    </div>
                    
                    <!-- Stats -->
                    <div style="display: flex; justify-content: space-around; padding: 20px 0; border-bottom: 1px solid var(--border-light);">
                        <div style="text-align: center;">
                            <div class="skeleton-line short" style="width: 40px; height: 22px; margin: 0 auto 4px; background: var(--bg-tertiary); border-radius: 4px;"></div>
                            <div class="skeleton-line short" style="width: 30px; height: 12px; margin: 0 auto; background: var(--bg-tertiary); border-radius: 4px;"></div>
                        </div>
                        <div style="text-align: center;">
                            <div class="skeleton-line short" style="width: 40px; height: 22px; margin: 0 auto 4px; background: var(--bg-tertiary); border-radius: 4px;"></div>
                            <div class="skeleton-line short" style="width: 30px; height: 12px; margin: 0 auto; background: var(--bg-tertiary); border-radius: 4px;"></div>
                        </div>
                        <div style="text-align: center;">
                            <div class="skeleton-line short" style="width: 40px; height: 22px; margin: 0 auto 4px; background: var(--bg-tertiary); border-radius: 4px;"></div>
                            <div class="skeleton-line short" style="width: 30px; height: 12px; margin: 0 auto; background: var(--bg-tertiary); border-radius: 4px;"></div>
                        </div>
                    </div>
                    
                    <!-- Monthly gigs -->
                    <div style="text-align: center; padding: 8px 0;">
                        <div class="skeleton-line short" style="margin: 0 auto; width: 150px; height: 14px; background: var(--bg-tertiary); border-radius: 4px;"></div>
                    </div>
                    
                    <!-- Address -->
                    <div style="padding: 16px 0; border-bottom: 1px solid var(--border-light);">
                        <div class="skeleton-line medium" style="height: 14px; background: var(--bg-tertiary); border-radius: 4px;"></div>
                    </div>
                    
                    <!-- Action Buttons -->
                    <div style="display: flex; flex-wrap: wrap; gap: 12px; padding: 20px 0; border-bottom: 1px solid var(--border-light);">
                        <div class="skeleton-line" style="flex: 1; height: 44px; background: var(--bg-tertiary); border-radius: 12px;"></div>
                        <div class="skeleton-line" style="flex: 1; height: 44px; background: var(--bg-tertiary); border-radius: 12px;"></div>
                    </div>
                    
                    <!-- Services Section -->
                    <div style="padding: 20px 0; border-bottom: 1px solid var(--border-light);">
                        <div class="skeleton-line short" style="width: 120px; height: 18px; margin-bottom: 16px; background: var(--bg-tertiary); border-radius: 4px;"></div>
                        <div style="display: flex; flex-wrap: wrap; gap: 8px;">
                            <div class="skeleton-tag" style="height: 28px; width: 70px; background: var(--bg-tertiary); border-radius: 20px;"></div>
                            <div class="skeleton-tag" style="height: 28px; width: 70px; background: var(--bg-tertiary); border-radius: 20px;"></div>
                            <div class="skeleton-tag" style="height: 28px; width: 70px; background: var(--bg-tertiary); border-radius: 20px;"></div>
                        </div>
                    </div>
                    
                    <!-- Portfolio Section -->
                    <div style="padding: 20px 0;">
                        <div class="skeleton-line short" style="width: 100px; height: 18px; margin-bottom: 16px; background: var(--bg-tertiary); border-radius: 4px;"></div>
                        <div style="display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px;">
                            <div class="skeleton-line" style="aspect-ratio: 1/1; background: var(--bg-tertiary); border-radius: 12px;"></div>
                            <div class="skeleton-line" style="aspect-ratio: 1/1; background: var(--bg-tertiary); border-radius: 12px;"></div>
                            <div class="skeleton-line" style="aspect-ratio: 1/1; background: var(--bg-tertiary); border-radius: 12px;"></div>
                        </div>
                    </div>
                </div>
            `;
        },
        search: (count) => {
            // Same as home for now
            let html = '';
            for (let i = 0; i < count; i++) {
                html += `
                    <div class="skeleton-card">
                        <div class="skeleton-header">
                            <div class="skeleton-avatar"></div>
                            <div class="skeleton-info">
                                <div class="skeleton-line medium"></div>
                                <div class="skeleton-line short"></div>
                            </div>
                        </div>
                        <div class="skeleton-tags">
                            <div class="skeleton-tag"></div>
                            <div class="skeleton-tag"></div>
                        </div>
                        <div class="skeleton-line short"></div>
                    </div>
                `;
            }
            return html;
        }
    };
    
    const template = templates[type];
    if (template) {
        container.innerHTML = template(count);
    }
}

// ========== HOME PAGE (Supabase - Infinite Scroll) ==========
async function loadHomeFeed(reset = false, skipSpinner = false) {
    if (!homeFeed) return;
    
    if (!window.auth?.currentUser) {
        showHomeFeedSkeletons(5);
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
        showHomeFeedSkeletons(5);
    }
    
    if (reset) {
        if (!skipSpinner) {
            // Show skeletons instead of spinner
            showHomeFeedSkeletons(5);
        }
        homeFeedOffset = 0;
        hasMoreHomeFeed = true;
        while (homeFeed.firstChild) {
            homeFeed.removeChild(homeFeed.firstChild);
        }
        // Re-show skeletons after clearing
        if (!skipSpinner) {
            showHomeFeedSkeletons(5);
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
        
        // Extract user IDs for batch fetch
        const userIds = providers.map(p => p.user_id);
        const firestoreUsers = await batchFetchUsersFromFirestore(userIds);
        
        // Build cards
        const cardsHtml = providers.map(provider => {
            const servicesList = provider.services ? provider.services.split(',').map(s => s.trim()) : [];
            const userFirestore = firestoreUsers[provider.user_id] || { isActive: false, hasCompletedGigs: false, gigsLast30Days: 0 };
            
            return `
            <div class="card" data-user-id="${provider.user_id}">
                <div class="card-header">
                    <img class="card-avatar" src="${getOptimizedImageUrl(provider.photo_url, 100, 100) || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(provider.display_name)}" alt="${provider.display_name}" loading="lazy">
                    <div class="card-info">
                        <div class="card-name">
                            ${provider.display_name}
                            ${userFirestore.isActive ? '<span class="active-badge">Active</span>' : ''}
                        </div>
                        <div class="card-rating">
                            <span class="star">★</span> ${(provider.rating || 0).toFixed(1)} (${provider.review_count || 0})
                        </div>
                    </div>
                </div>
                <div class="card-services">
                    ${servicesList.slice(0, 3).map(s => `<span class="service-tag">${s}</span>`).join('')}
                </div>
                ${userFirestore.hasCompletedGigs ? `<div class="card-monthly">${userFirestore.isActive ? '🔥 ' : ''}${userFirestore.gigsLast30Days} gigs this month</div>` : ''}
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
                
                // Pass cached card data to avoid refetching
                const userId = card.dataset.userId;
                const cardData = {
                    displayName: card.querySelector('.card-name')?.childNodes[0]?.textContent?.trim() || 'Anonymous',
                    photoURL: card.querySelector('.card-avatar')?.src || null,
                    rating: parseFloat(card.querySelector('.card-rating')?.textContent?.match(/★\s*([\d.]+)/)?.[1]) || 0,
                    reviewCount: parseInt(card.querySelector('.card-rating')?.textContent?.match(/\((\d+)\)/)?.[1]) || 0,
                    gigCount: parseInt(card.querySelector('.stat-item')?.textContent?.match(/📊\s*(\d+)/)?.[1]) || 0,
                    monthlyGigs: parseInt(card.querySelectorAll('.stat-item')[1]?.textContent?.match(/🔥\s*(\d+)/)?.[1]) || 0,
                    services: Array.from(card.querySelectorAll('.service-tag')).map(tag => tag.textContent.trim()),
                    distance: card.querySelector('.card-distance')?.textContent?.replace('📍', '').trim() || ''
                };
                
                showUserBottomSheet(userId, cardData);
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
async function showUserBottomSheet(userId, cachedData = null) {
    try {
        // ========== STEP 1: Try to load from cache ==========
        const cachedProvider = getCachedProvider(userId);
        
        // ========== STEP 2: Determine what data to show immediately ==========
        let displayData;
        
        if (cachedProvider) {
            // Use full cache
            displayData = {
                displayName: cachedProvider.displayName || 'Anonymous',
                photoURL: cachedProvider.photoURL || null,
                rating: cachedProvider.rating || 0,
                reviewCount: cachedProvider.reviewCount || 0,
                gigCount: cachedProvider.gigCount || 0,
                gigsLast30Days: cachedProvider.gigsLast30Days || 0,
                services: cachedProvider.services || [],
                bio: cachedProvider.bio || '',
                active: cachedProvider.active || false
            };
            console.log('📦 Using cached provider data for:', userId);
        } else if (cachedData) {
            // Fallback to card data
            displayData = {
                displayName: cachedData.displayName || 'Anonymous',
                photoURL: cachedData.photoURL || null,
                rating: cachedData.rating || 0,
                reviewCount: cachedData.reviewCount || 0,
                gigCount: cachedData.gigCount || 0,
                gigsLast30Days: cachedData.gigsLast30Days || 0,
                services: cachedData.services || [],
                bio: '',
                active: false
            };
            console.log('📋 Using card data for:', userId);
        } else {
            // No data at all - show minimal
            displayData = {
                displayName: 'Loading...',
                photoURL: null,
                rating: 0,
                reviewCount: 0,
                gigCount: 0,
                gigsLast30Days: 0,
                services: [],
                bio: '',
                active: false
            };
        }
        
        // ========== STEP 3: Open bottom sheet IMMEDIATELY ==========
        const activeStatusText = displayData.active ? '<span class="active-badge active-badge-in-sheet">Active</span>' : '';
        
        window.openBottomSheet(`
            <div style="text-align: center; padding: 8px 0;">
                <img src="${getOptimizedImageUrl(displayData.photoURL, 160, 160) || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(displayData.displayName || 'User')}" style="width: 80px; height: 80px; border-radius: 50%; object-fit: cover; margin-bottom: 12px;">
                <div id="bottom-sheet-header" style="display: flex; align-items: center; justify-content: center; flex-wrap: wrap;">
                    <h3>${displayData.displayName || 'Anonymous'}</h3>
                    ${activeStatusText}
                </div>
                <div class="card-rating" style="justify-content: center; margin: 8px 0;">★ ${(displayData.rating || 0).toFixed(1)} (${displayData.reviewCount || 0})</div>
                <div style="font-size: 13px; color: var(--text-secondary); margin: 4px 0;">📊 ${displayData.gigCount || 0} gigs total${displayData.gigCount > 0 ? ' • ' + (displayData.active ? '🔥 ' : '') + displayData.gigsLast30Days + ' this month' : ''}</div>
                <p id="profile-bio-text" style="color: var(--text-secondary); margin: 8px 0;">${displayData.bio || ''}</p>
                <div class="card-services" style="justify-content: center;">${(displayData.services || []).slice(0, 3).map(s => `<span class="service-tag">${s}</span>`).join('')}</div>
                <div style="display: flex; gap: 12px; margin-top: 20px;">
                    <button id="view-full-profile" class="btn-primary" style="flex: 1;" data-user-id="${userId}">View Full Profile</button>
                    <button id="message-from-sheet" class="btn-secondary" style="flex: 1;">Message</button>
                </div>
            </div>
        `);
        
        // Attach event listeners
        const viewProfileBtn = document.getElementById('view-full-profile');
        if (viewProfileBtn) {
            viewProfileBtn.addEventListener('click', () => {
                const profileId = viewProfileBtn.dataset.userId;
                window.currentViewedUserId = profileId;
                window.pushToNavigationHistory();
                window.closeBottomSheet();
                loadProfile(profileId);
                window.navigateToPage('profile', { preserveHistory: true, skipProfileLoad: true });
            });
        }
        
        const messageBtn = document.getElementById('message-from-sheet');
        if (messageBtn) {
            messageBtn.addEventListener('click', () => {
                window.closeBottomSheet();
                openChat(userId);
            });
        }
        
        // ========== STEP 4: Fetch fresh data in background ==========
        
        // Cancel any in-flight background fetch from a previous sheet
        if (currentSheetAbortController) {
            currentSheetAbortController.abort();
        }
        
        /// Create new abort controller for this fetch
        currentSheetAbortController = new AbortController();
        window.currentSheetAbortController = currentSheetAbortController; // Expose for closeBottomSheet
        const signal = currentSheetAbortController.signal;
        
        (async () => {
            try {
                // Fetch fresh data from Firestore
                const userRef = doc(window.db, 'users', userId);
                const userSnap = await getDoc(userRef);
                
                // Fetch active status from Supabase (KEEP THIS for backward compatibility)
                const locationPromise = supabase
                    .from('provider_locations')
                    .select('last_gig_date')
                    .eq('user_id', userId)
                    .single();
                
                // Wait for location fetch
                const locationResult = await locationPromise;
                
                // Check if aborted before processing
                if (signal.aborted) {
                    console.log('🛑 Background fetch aborted for:', userId);
                    return;
                }
                
                const userData = userSnap.exists() ? userSnap.data() : null;
                const locationData = locationResult.data;
                
                // Get fresh gig counters
                let gigsLast7Days = userData?.gigsLast7Days || 0;
                let gigsLast30Days = userData?.gigsLast30Days || 0;
                
                // If recalculate function exists, use it
                if (typeof window.recalculateStaleCounters === 'function') {
                    const freshCounts = await window.recalculateStaleCounters(userId);
                    if (freshCounts) {
                        gigsLast7Days = freshCounts.gigsLast7Days;
                        gigsLast30Days = freshCounts.gigsLast30Days;
                    }
                }
                
                // Determine active status using the new logic
                const hasCompletedGigs = (userData?.gigCount || 0) > 0;
                const isActive = hasCompletedGigs && ((gigsLast7Days >= 1) || (gigsLast30Days >= 3));
                
                // Build fresh data object
                const freshData = {
                    displayName: userData?.displayName || displayData.displayName,
                    photoURL: userData?.photoURL || displayData.photoURL,
                    rating: userData?.rating || displayData.rating,
                    reviewCount: userData?.reviewCount || displayData.reviewCount,
                    gigCount: userData?.gigCount || displayData.gigCount,
                    gigsLast30Days: gigsLast30Days,
                    services: userData?.services || displayData.services,
                    bio: userData?.bio || '',
                    active: isActive
                };
                
                // Check again before DOM updates
                if (signal.aborted) {
                    console.log('🛑 Skipping DOM updates, fetch aborted');
                    return;
                }
                
                // ========== STEP 5: Update DOM only if changed ==========
                
                // Update bio if changed
                const bioElement = document.getElementById('profile-bio-text');
                if (bioElement && bioElement.textContent !== freshData.bio) {
                    bioElement.style.transition = 'opacity 0.15s ease';
                    bioElement.style.opacity = '0';
                    setTimeout(() => {
                        if (!signal.aborted) {
                            bioElement.textContent = freshData.bio;
                            bioElement.style.opacity = '1';
                        }
                    }, 100);
                }
                
                // Update active badge if changed
                if (!signal.aborted && freshData.active !== displayData.active) {
                    const headerDiv = document.getElementById('bottom-sheet-header');
                    if (freshData.active) {
                        const existingBadge = document.querySelector('.active-badge-in-sheet');
                        if (!existingBadge && headerDiv) {
                            const badge = document.createElement('span');
                            badge.className = 'active-badge active-badge-in-sheet';
                            badge.textContent = 'Active';
                            badge.style.marginLeft = '8px';
                            headerDiv.appendChild(badge);
                        }
                    } else {
                        const existingBadge = document.querySelector('.active-badge-in-sheet');
                        if (existingBadge) existingBadge.remove();
                    }
                }
                
                // ========== STEP 6: Save to cache ==========
                if (!signal.aborted) {
                    setCachedProvider(userId, freshData);
                    console.log('✅ Background fetch completed for:', userId);
                }
                
            } catch (error) {
                // Ignore abort errors
                if (error.name === 'AbortError' || signal.aborted) {
                    console.log('🛑 Background fetch aborted');
                    return;
                }
                console.warn('Background fetch failed, using cached/display data:', error);
            }
        })();
        
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
        
        // Extract user IDs for batch fetch
        const userIds = filteredResults.map(p => p.user_id);
        const firestoreUsers = await batchFetchUsersFromFirestore(userIds);
        
        const cardsHtml = filteredResults.map(provider => {
            const servicesList = provider.services ? provider.services.split(',').map(s => s.trim()) : [];
            const userFirestore = firestoreUsers[provider.user_id] || { isActive: false, hasCompletedGigs: false, gigsLast30Days: 0 };
            
            return `
            <div class="card" data-user-id="${provider.user_id}">
                <div class="card-header">
                    <img class="card-avatar" src="${getOptimizedImageUrl(provider.photo_url, 100, 100) || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(provider.display_name)}" alt="${provider.display_name}" loading="lazy">
                    <div class="card-info">
                        <div class="card-name">
                            ${provider.display_name}
                            ${userFirestore.isActive ? '<span class="active-badge">Active</span>' : ''}
                        </div>
                        <div class="card-rating">
                            <span class="star">★</span> ${(provider.rating || 0).toFixed(1)} (${provider.review_count || 0})
                        </div>
                    </div>
                </div>
                <div class="card-services">
                    ${servicesList.slice(0, 2).map(s => `<span class="service-tag">${s}</span>`).join('')}
                </div>
                ${userFirestore.hasCompletedGigs ? `<div class="card-monthly">${userFirestore.isActive ? '🔥 ' : ''}${userFirestore.gigsLast30Days} gigs this month</div>` : ''}
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
                
                const userId = card.dataset.userId;
                const cardData = {
                    displayName: card.querySelector('.card-name')?.childNodes[0]?.textContent?.trim() || 'Anonymous',
                    photoURL: card.querySelector('.card-avatar')?.src || null,
                    rating: parseFloat(card.querySelector('.card-rating')?.textContent?.match(/★\s*([\d.]+)/)?.[1]) || 0,
                    reviewCount: parseInt(card.querySelector('.card-rating')?.textContent?.match(/\((\d+)\)/)?.[1]) || 0,
                    gigCount: parseInt(card.querySelector('.stat-item')?.textContent?.match(/📊\s*(\d+)/)?.[1]) || 0,
                    monthlyGigs: parseInt(card.querySelectorAll('.stat-item')[1]?.textContent?.match(/🔥\s*(\d+)/)?.[1]) || 0,
                    services: Array.from(card.querySelectorAll('.service-tag')).map(tag => tag.textContent.trim()),
                    distance: card.querySelector('.card-distance')?.textContent?.replace('📍', '').trim() || ''
                };
                
                showUserBottomSheet(userId, cardData);
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
async function loadChats() {
    if (!chatsList) return;
    if (!window.db || !window.auth || !window.auth.currentUser) {
        chatsList.innerHTML = '<div class="empty-state">Loading...</div>';
        return;
    }
    
    // Check if we have cached chats (Firestore persistence will handle this)
    // Just show skeletons for first-ever load
    const hasCachedData = localStorage.getItem('has_chats_cache') === 'true';
    
    if (!hasCachedData) {
        // First time ever - show skeletons
        showSkeletons('chat', 6);
    }
    // If has cached data, leave container empty - Firestore will populate near-instantly
    
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
        // Mark that we have data (for future loads)
        localStorage.setItem('has_chats_cache', 'true');
        
        if (snapshot.empty) {
            chatsList.innerHTML = '<div class="empty-state">No messages yet</div>';
            updateMessagesTabBadge(0);
            return;
        }
        
        // Collect all chat data
        const chats = [];
        let totalUnread = 0;
        
        // Collect all unique user IDs
        const userIds = [...new Set(
            snapshot.docs.map(doc => {
                const chat = doc.data();
                return chat.participants.find(p => p !== window.auth.currentUser.uid);
            })
        )];
        
        // Fetch all profiles from FIRESTORE
        const profilesMap = {};
        
        if (userIds.length > 0) {
            // Firestore doesn't support "IN" queries with more than 30 items
            // So we fetch in batches if needed
            const batchSize = 30;
            for (let i = 0; i < userIds.length; i += batchSize) {
                const batch = userIds.slice(i, i + batchSize);
                
                // We need to fetch each user individually since Firestore doesn't have a native batch get by ID
                const promises = batch.map(async (uid) => {
                    const userRef = doc(window.db, 'users', uid);
                    const userSnap = await getDoc(userRef);
                    if (userSnap.exists()) {
                        const data = userSnap.data();
                        profilesMap[uid] = {
                            user_id: uid,
                            display_name: data.displayName || 'User',
                            photo_url: data.photoURL || null,
                            services: data.services ? data.services.join(', ') : ''
                        };
                    } else {
                        profilesMap[uid] = {
                            user_id: uid,
                            display_name: 'User',
                            photo_url: null,
                            services: ''
                        };
                    }
                });
                
                await Promise.all(promises);
            }
        }
        
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
        
        // Update badge on Messages tab
        updateMessagesTabBadge(totalUnread);
        
        // Render chat list
        chatsList.innerHTML = chats.map(chat => `
            <div class="chat-item" data-chat-id="${chat.id}" data-user-id="${chat.otherUser.id}">
                <img class="chat-avatar" src="${getOptimizedImageUrl(chat.otherUser.photoURL, 100, 100) || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(chat.otherUser.displayName || 'User')}" alt="" loading="lazy">
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
            item.addEventListener('click', (e) => {
                // Don't open chat if the click was on the avatar
                if (e.target.closest('.chat-avatar')) {
                    return;
                }
                openChat(item.dataset.userId, item.dataset.chatId);
            });
        });
        
    }, (error) => {
        console.error('Chat list listener error:', error);
        chatsList.innerHTML = '<div class="empty-state">Error loading chats. Pull to refresh.</div>';
        localStorage.removeItem('has_chats_cache');
    });
}

async function openChat(userId, chatId = null) {
    // ========== STEP 1: Navigate IMMEDIATELY ==========
    window.pushToNavigationHistory();
    window.navigateToPage('chat', { preserveHistory: true });
    
    // ========== STEP 2: Show cached header IMMEDIATELY ==========
    const cachedProvider = getCachedProvider(userId);
    const headerName = document.getElementById('chat-header-name');
    const headerAvatar = document.getElementById('chat-header-avatar');
    
    if (headerName) {
        headerName.textContent = cachedProvider?.displayName || 'Chat';
    }
    if (headerAvatar) {
        if (cachedProvider?.photoURL) {
            headerAvatar.src = getOptimizedImageUrl(cachedProvider.photoURL, 80, 80);
            headerAvatar.style.display = 'inline-block';
        } else {
            headerAvatar.style.display = 'none';
        }
    }
    
    // ========== STEP 3: Clear messages container (no spinner needed with persistence) ==========
    const messagesContainer = document.getElementById('chat-messages-container');
    if (messagesContainer) {
        messagesContainer.innerHTML = ''; // Empty - messages will populate near-instantly
    }
    
    // ========== STEP 4: Do everything else in background ==========
    currentChatUser = userId;
    currentChatId = chatId;
    window.currentChatId = chatId;
    
    (async () => {
        try {
            let chat = chatId;
            
            // Find or create chat
            if (!chat) {
                const chatsRef = collection(window.db, 'chats');
                const q = query(chatsRef, where('participants', 'array-contains', window.auth.currentUser.uid));
                const existingChat = await getDocs(q);
                let found = null;
                existingChat.forEach(doc => {
                    if (doc.data().participants.includes(userId)) found = doc.id;
                });
                chat = found;
                if (!chat) {
                    const newChatRef = await addDoc(collection(window.db, 'chats'), {
                        participants: [window.auth.currentUser.uid, userId],
                        createdAt: new Date().toISOString(),
                        lastMessageTime: new Date().toISOString(),
                        lastMessage: ''
                    });
                    chat = newChatRef.id;
                }
                currentChatId = chat;
            }
            
            // Reset unread count
            const chatRoomRef = doc(window.db, 'chats', chat);
            await updateDoc(chatRoomRef, {
                [`unreadCount.${window.auth.currentUser.uid}`]: 0
            });
            
            // Fetch fresh user data
            const userData = await getSingleProfileFromSupabase(userId);
            
            // Update header with fresh data
            if (headerName && userData) {
                headerName.textContent = userData.displayName || 'User';
            }
            if (headerAvatar && userData?.photoURL) {
                headerAvatar.src = getOptimizedImageUrl(userData.photoURL, 80, 80);
                headerAvatar.style.display = 'inline-block';
            }
            
           // Cache the fresh data
            if (userData) {
                setCachedProvider(userId, {
                    displayName: userData.displayName,
                    photoURL: userData.photoURL,
                    rating: userData.rating,
                    reviewCount: userData.reviewCount,
                    gigCount: userData.gigCount,
                    gigsLast30Days: userData.gigsLast30Days || 0,
                    services: userData.services,
                    bio: userData.bio,
                    active: false
                });
            }
            
        } catch (error) {
            console.warn('Background chat setup error:', error);
        }
    })();
    
    // ========== STEP 5: Set up UI elements (header click, back button, etc.) ==========
    const headerInfo = document.getElementById('chat-header-info');
    if (headerInfo) {
        headerInfo.style.cursor = 'pointer';
        const newHeaderInfo = headerInfo.cloneNode(true);
        headerInfo.parentNode.replaceChild(newHeaderInfo, headerInfo);
        newHeaderInfo.addEventListener('click', () => {
            window.currentViewedUserId = userId;
            window.pushToNavigationHistory();
            loadProfile(userId);
            window.navigateToPage('profile', { preserveHistory: true, skipProfileLoad: true });
        });
    }
    
    const backBtn = document.getElementById('chat-back-btn');
    if (backBtn) {
        const newBackBtn = backBtn.cloneNode(true);
        backBtn.parentNode.replaceChild(newBackBtn, backBtn);
        newBackBtn.addEventListener('click', () => {
            window.goBack();
        });
    }
    
    // Set up message input and send button
    const input = document.getElementById('chat-page-input');
    const sendBtn = document.getElementById('chat-page-send-btn');
    
    if (sendBtn) {
        const newSendBtn = sendBtn.cloneNode(true);
        sendBtn.parentNode.replaceChild(newSendBtn, sendBtn);
        newSendBtn.addEventListener('click', () => {
            const msgInput = document.getElementById('chat-page-input');
            if (msgInput) {
                sendMessage(currentChatId, msgInput.value);
                msgInput.value = '';
            }
        });
    }
    
    if (input) {
        const newInput = input.cloneNode(true);
        input.parentNode.replaceChild(newInput, input);
        newInput.addEventListener('keypress', (e) => {
            if (e.key === 'Enter') {
                const msgInput = document.getElementById('chat-page-input');
                if (msgInput) {
                    sendMessage(currentChatId, msgInput.value);
                    msgInput.value = '';
                }
            }
        });
    }
    
    // ========== STEP 6: Set up actions container (Register Gig, Review, etc.) ==========
    // This runs after we have chat ID
    (async () => {
        // Wait for chat ID to be set
        while (!currentChatId) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        const chat = currentChatId;
        const chatContent = document.querySelector('.chat-page-content');
        let actionsContainer = document.getElementById('chat-actions-container');
        
        if (!actionsContainer) {
            actionsContainer = document.createElement('div');
            actionsContainer.id = 'chat-actions-container';
            actionsContainer.style.cssText = 'padding: 12px 16px; border-top: 1px solid var(--border-light);';
            
            const inputContainer = document.querySelector('.chat-input-container');
            if (inputContainer && chatContent) {
                chatContent.insertBefore(actionsContainer, inputContainer);
            }
        }
        
        actionsContainer.innerHTML = `
            <div id="pending-review-toast-provider" style="display: none; margin-bottom: 12px; padding: 12px; background: var(--warning-yellow); border-radius: 10px; text-align: center;"></div>
            <div id="pending-review-toast-client" style="display: none; margin-bottom: 12px; padding: 12px; background: var(--warning-yellow); border-radius: 10px; text-align: center;"></div>
            <button id="register-gig-chat" class="btn-secondary" style="width: 100%; padding: 12px; background: var(--accent-orange); color: white; border: none; border-radius: 30px; font-weight: 600;">📋 Register Gig with this person</button>
            <div style="display: flex; gap: 12px; margin-top: 12px;">
                <button id="submit-review-chat" class="btn-primary" style="flex: 1; padding: 12px; border-radius: 30px; display: none;">⭐ Submit Review</button>
                <button id="cancel-gig-chat" class="btn-secondary" style="flex: 1; padding: 12px; border-radius: 30px; display: none; border: 1px solid var(--error-red); color: var(--error-red);">❌ Cancel Gig</button>
            </div>
        `;
        
        document.getElementById('register-gig-chat')?.addEventListener('click', () => registerGig(chat, userId));
        document.getElementById('submit-review-chat')?.addEventListener('click', () => showReviewBottomSheet(userId, chat));
        document.getElementById('cancel-gig-chat')?.addEventListener('click', () => cancelGig(chat, userId));
        
        await checkGigStatusAndUpdateUI(chat, userId);
    })();
    
    // ========== STEP 7: Set up messages listener ==========
    if (currentMessagesUnsubscribe) {
        currentMessagesUnsubscribe();
    }

    // Clean up gig status listener when opening new chat
    if (window.gigStatusListener) {
        window.gigStatusListener();  // ✅ Call it directly
        window.gigStatusListener = null;
        console.log('🧹 Cleaned up previous gig status listener');
    }
    
    // Wait for chat ID, then set up listener
    (async () => {
        while (!currentChatId) {
            await new Promise(resolve => setTimeout(resolve, 50));
        }
        
        const chat = currentChatId;
        const messagesRef = collection(window.db, 'chats', chat, 'messages');
        const q = query(
            messagesRef,
            orderBy('timestamp', 'desc'),
            limit(MESSAGES_PER_PAGE)
        );
        
        lastVisibleMessage = null;
        hasMoreMessages = true;
        isLoadingMoreMessages = false;
        
        const messagesContainer = document.getElementById('chat-messages-container');
        
        currentMessagesUnsubscribe = onSnapshot(q, (snapshot) => {
            if (!messagesContainer) return;
            messagesContainer.innerHTML = '';
            
            if (snapshot.empty) {
                hasMoreMessages = false;
                return;
            }
            
            lastVisibleMessage = snapshot.docs[snapshot.docs.length - 1];
            hasMoreMessages = snapshot.docs.length === MESSAGES_PER_PAGE;
            
            const reversedDocs = [...snapshot.docs].reverse();
            reversedDocs.forEach(doc => {
                const msg = doc.data();
                const isMe = msg.senderId === window.auth.currentUser.uid;
                messagesContainer.innerHTML += `
                    <div class="message-wrapper" data-message-id="${doc.id}" style="display: flex; justify-content: ${isMe ? 'flex-end' : 'flex-start'}; padding: 4px 16px;">
                        <div style="max-width: 70%; padding: 10px 14px; border-radius: 18px; background: ${isMe ? 'var(--accent-orange)' : 'var(--bg-secondary)'}; color: ${isMe ? 'white' : 'var(--text-primary)'};">
                            ${msg.text}
                            ${msg.imageUrl ? `<img src="${msg.imageUrl}" style="max-width: 200px; border-radius: 10px; margin-top: 8px;">` : ''}
                            <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">${new Date(msg.timestamp).toLocaleTimeString()}</div>
                        </div>
                    </div>
                `;
            });
            
            const wasAtBottom = messagesContainer.scrollTop + messagesContainer.clientHeight >= messagesContainer.scrollHeight - 50;
            if (wasAtBottom) {
                messagesContainer.scrollTop = messagesContainer.scrollHeight;
            }
            
            setupMessagesScrollObserver(messagesContainer, chat);
            
            document.querySelectorAll('#chat-messages-container .message-wrapper').forEach(wrapper => {
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
    })();
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
        
        document.getElementById('chat-page-input').value = '';
        window.haptic('light');
    } catch (error) {
        console.error('sendMessage error:', error);
        window.showToast('Error sending message', 'error');
    }
}

// Store active listeners so we can clean them up
let gigStatusListener = null;
let currentListenerChatId = null;

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
                            const userId = window.auth.currentUser.uid;
                            const userRef = doc(window.db, 'users', userId);
                            
                            // Get current credits
                            const userSnap = await getDoc(userRef);
                            const currentCredits = userSnap.exists() ? (userSnap.data().credits || 0) : 0;
                            const newCredits = currentCredits + credits;
                            
                            // Update Firestore user credits
                            await updateDoc(userRef, {
                                credits: newCredits,
                                updatedAt: new Date().toISOString()
                            });
                            
                            // Add transaction record
                            const transactionsRef = collection(window.db, 'transactions');
                            await addDoc(transactionsRef, {
                                userId: userId,
                                type: 'credit_purchase',
                                credits: credits,
                                amount: price,
                                reference: response.reference,
                                createdAt: new Date().toISOString()
                            });
                            
                            // Update in-memory currentUserData
                            if (window.currentUserData) {
                                window.currentUserData.credits = newCredits;
                            }
                            
                            window.showToast(`Added ${credits} credits!`);
                            window.haptic('heavy');
                            loadProfile();

                            // Increment admin stats
                            incrementAdminStats('totalCreditsPurchased', credits);
                            incrementAdminStats('totalRevenue', price);
                            
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
        const userId = window.auth.currentUser.uid;
        const transactionsRef = collection(window.db, 'transactions');
        const q = query(
            transactionsRef,
            where('userId', '==', userId),
            orderBy('createdAt', 'desc'),
            limit(50)
        );
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            window.showToast('No transactions yet');
            return;
        }
        
        let html = '<h3 style="margin-bottom: 16px;">Transaction History</h3>';
        snapshot.forEach(doc => {
            const t = doc.data();
            
            // Determine display type
            let typeDisplay = '';
            let amountDisplay = '';
            
            if (t.type === 'credit_purchase') {
                typeDisplay = '💰 Purchased';
                amountDisplay = `₦${t.amount?.toLocaleString() || '0'}`;
            } else if (t.type === 'admin_gift') {
                typeDisplay = '🎁 Admin Gift';
                amountDisplay = 'Free';
            } else if (t.type === 'gig_used') {
                typeDisplay = '📋 Gig Used';
                amountDisplay = `₦${t.amount?.toLocaleString() || '0'}`;
            } else {
                typeDisplay = t.type || 'Transaction';
                amountDisplay = '—';
            }
            
            const creditDisplay = t.credits > 0 ? `+${t.credits}` : `${t.credits}`;
            const date = t.createdAt ? new Date(t.createdAt).toLocaleDateString() : 'Unknown date';
            
            html += `
                <div style="padding: 12px; border-bottom: 1px solid var(--border-light);">
                    <div><strong>${typeDisplay}</strong></div>
                    <div>${creditDisplay} credits • ${amountDisplay}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${date}</div>
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
    
    const isOwnProfile = targetId === window.auth.currentUser?.uid;
    
    try {
        // Show skeleton immediately (unless skipSpinner is true)
        if (!skipSpinner) {
            showSkeletons('profile');
        }
        
        // Fetch profile from FIRESTORE
        const userRef = doc(window.db, 'users', targetId);
        const userSnap = await getDoc(userRef);
        
        if (!userSnap.exists()) {
            profileContent.innerHTML = '<div class="empty-state">User not found</div>';
            return;
        }
        
        const profileData = userSnap.data();
        
        // Get last gig date from Supabase provider_locations (KEEP THIS for backward compatibility)
        let lastGigDate = null;
        try {
            const { data: locationData } = await supabase
                .from('provider_locations')
                .select('last_gig_date')
                .eq('user_id', targetId)
                .single();
            lastGigDate = locationData?.last_gig_date;
        } catch (err) {
            console.warn('Could not fetch location data:', err);
        }
        
        // Get fresh gig counters (handles lazy cleanup automatically)
        let gigsLast7Days = profileData.gigsLast7Days || 0;
        let gigsLast30Days = profileData.gigsLast30Days || 0;
        
        // If recalculate function exists, use it to ensure fresh counts
        if (typeof window.recalculateStaleCounters === 'function') {
            const freshCounts = await window.recalculateStaleCounters(targetId);
            if (freshCounts) {
                gigsLast7Days = freshCounts.gigsLast7Days;
                gigsLast30Days = freshCounts.gigsLast30Days;
            }
        }
        
        const profile = {
            id: targetId,
            displayName: profileData.displayName || 'Anonymous',
            photoURL: profileData.photoURL || null,
            bio: profileData.bio || '',
            phone: profileData.phone || '',
            addressText: profileData.addressText || '',
            services: profileData.services || [],
            portfolio: profileData.portfolio || [],
            credits: profileData.credits || 0,
            gigCount: profileData.gigCount || 0,
            rating: profileData.rating || 0,
            totalRatingSum: profileData.totalRatingSum || 0,
            reviewCount: profileData.reviewCount || 0,
            gigsLast7Days: gigsLast7Days,
            gigsLast30Days: gigsLast30Days,
            lastGigDate: lastGigDate
        };
        
        window.setCurrentViewedUserId(targetId);
        
        // Determine active status using the new logic
        const isActive = (gigsLast7Days >= 1) || (gigsLast30Days >= 3);
        const hasCompletedGigs = (profile.gigCount || 0) > 0;
        
        const profileHeaderTitle = document.getElementById('profile-header-title');
        const settingsBtn = document.getElementById('profile-settings-btn');
        const backBtn = document.getElementById('profile-back-btn');
        const bottomNav = document.getElementById('bottom-nav');
        
        if (profileHeaderTitle) {
            if (isOwnProfile) {
                profileHeaderTitle.textContent = 'Profile';
                if (settingsBtn) settingsBtn.style.display = 'flex';
                if (backBtn) backBtn.style.display = 'none';
                if (bottomNav) bottomNav.style.display = 'flex';
            } else {
                profileHeaderTitle.textContent = profile.displayName || 'User';
                if (settingsBtn) settingsBtn.style.display = 'none';
                if (backBtn) backBtn.style.display = 'flex';
                if (bottomNav) bottomNav.style.display = 'none';
                
                window.currentViewedUserId = targetId;
            }
        }
        
        // Back button handler for viewing other profiles
        if (backBtn) {
            const newBackBtn = backBtn.cloneNode(true);
            backBtn.parentNode.replaceChild(newBackBtn, backBtn);
            newBackBtn.addEventListener('click', () => {
                window.goBack();
            });
        }
        
        profileContent.innerHTML = `
            <div class="profile-header">
                <img class="profile-avatar" src="${getOptimizedImageUrl(profile.photoURL, 200, 200) || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(profile.displayName || 'User')}" alt="" data-user-id="${profile.id}">
                <h2 class="profile-name">${profile.displayName || 'Anonymous'}</h2>
                <p class="profile-bio">${profile.bio || 'No bio yet'}</p>
                ${hasCompletedGigs && isActive ? '<span class="active-badge">Active</span>' : ''}
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
            ${hasCompletedGigs ? `
            <div class="profile-monthly-gigs" style="text-align: center; padding: 8px 0; color: var(--accent-orange); font-weight: 500;">
                ${isActive ? '🔥 ' : ''}${gigsLast30Days} gigs this month
            </div>
            ` : ''}
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
            const contactBtn = document.getElementById('contact-now-btn');
            if (contactBtn) {
                contactBtn.addEventListener('click', () => {
                    openChat(profile.id);
                });
            }
        }
        
        document.querySelectorAll('.portfolio-item').forEach(img => {
            img.addEventListener('click', () => {
                const fullSizeUrl = getOptimizedImageUrl(img.src, null, null, true);
                window.openBottomSheet(`<img src="${fullSizeUrl}" style="width: 100%; border-radius: 20px;">`);
            });
        });
        document.querySelector('.stat[data-stat="rating"]')?.addEventListener('click', () => showReviews(targetId));
        
        // Cache the profile data for others (reuse bottom sheet cache)
        if (!isOwnProfile) {
            setCachedProvider(targetId, {
                displayName: profile.displayName,
                photoURL: profile.photoURL,
                rating: profile.rating,
                reviewCount: profile.reviewCount,
                gigCount: profile.gigCount,
                gigsLast30Days: gigsLast30Days,
                services: profile.services,
                bio: profile.bio,
                active: isActive
            });
            console.log('💾 Cached profile data for:', targetId);
        }
        
        // Profile avatar click handler (for viewing other profiles' avatars)
        const profileAvatar = document.querySelector('.profile-avatar');
        if (profileAvatar && !isOwnProfile) {
            profileAvatar.style.cursor = 'pointer';
            profileAvatar.addEventListener('click', () => {
                const fullSizeUrl = getOptimizedImageUrl(profile.photoURL, null, null, true);
                window.openBottomSheet(`<img src="${fullSizeUrl}" style="width: 100%; border-radius: 20px;">`);
            });
        }
        
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
        // Fetch stats from Firestore aggregated document (OPTIMIZED - 1 read!)
        const statsRef = doc(window.db, 'admin_stats', 'stats');
        const statsSnap = await getDoc(statsRef);
        
        const stats = statsSnap.exists() ? statsSnap.data() : {
            totalUsers: 0,
            totalGigs: 0,
            totalCreditsPurchased: 0,
            totalRevenue: 0,
            pendingRequests: 0,
            usersJoinedToday: 0,
            usersJoinedWeek: 0,
            usersJoinedMonth: 0,
            usersJoinedYear: 0
        };
        
        adminContent.innerHTML = `
            <div class="admin-dashboard">
                <h3>📊 Dashboard Overview</h3>
                
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${stats.totalUsers || 0}</div>
                        <div class="stat-label">Total Users</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.totalGigs || 0}</div>
                        <div class="stat-label">Total Gigs</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.totalCreditsPurchased || 0}</div>
                        <div class="stat-label">Credits Sold</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">₦${(stats.totalRevenue || 0).toLocaleString()}</div>
                        <div class="stat-label">Revenue</div>
                    </div>
                </div>
                
                <h3 style="margin-top: 24px;">📈 User Growth</h3>
                <div class="stats-grid">
                    <div class="stat-card">
                        <div class="stat-value">${stats.usersJoinedToday || 0}</div>
                        <div class="stat-label">Joined Today</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.usersJoinedWeek || 0}</div>
                        <div class="stat-label">Joined This Week</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.usersJoinedMonth || 0}</div>
                        <div class="stat-label">Joined This Month</div>
                    </div>
                    <div class="stat-card">
                        <div class="stat-value">${stats.usersJoinedYear || 0}</div>
                        <div class="stat-label">Joined This Year</div>
                    </div>
                </div>
                
                <h3 style="margin-top: 24px;">⚡ Quick Actions</h3>
                <div class="admin-actions">
                    <button id="admin-gift-credits-btn" class="admin-btn-primary">🎁 Gift Credits</button>
                    <button id="admin-service-requests-btn" class="admin-btn-secondary">📋 Service Requests (${stats.pendingRequests || 0})</button>
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
            // Query Firestore users collection by email
            const usersRef = collection(window.db, 'users');
            const q = query(usersRef, where('email', '==', email), limit(1));
            const snapshot = await getDocs(q);
            
            const userInfo = document.getElementById('admin-user-info');
            const sendBtn = document.getElementById('admin-send-credits-btn');
            
            if (!snapshot.empty) {
                const doc = snapshot.docs[0];
                foundUserId = doc.id;
                const userData = doc.data();
                userInfo.style.display = 'block';
                userInfo.innerHTML = `
                    ✅ <strong>${userData.displayName || 'User'}</strong><br>
                    Current Credits: ${userData.credits || 0}
                `;
                sendBtn.disabled = false;
                window.showToast('User found!', 'success');
            } else {
                userInfo.style.display = 'block';
                userInfo.innerHTML = `❌ No user found with this email`;
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
            // Get current credits from Firestore
            const userRef = doc(window.db, 'users', foundUserId);
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) {
                throw new Error('User not found');
            }
            
            const userData = userSnap.data();
            const currentCredits = userData.credits || 0;
            const newCredits = currentCredits + credits;
            
            // Update user credits
            await updateDoc(userRef, {
                credits: newCredits,
                updatedAt: new Date().toISOString()
            });
            
            // Add transaction record
            const transactionsRef = collection(window.db, 'transactions');
            await addDoc(transactionsRef, {
                userId: foundUserId,
                type: 'admin_gift',
                credits: credits,
                amount: 0,
                reference: 'admin_' + Date.now(),
                createdAt: new Date().toISOString()
            });
            
            window.showToast(`✅ Sent ${credits} credits!`, 'success');
            document.getElementById('admin-user-info').innerHTML = `
                ✅ Credits sent!<br>
                New Balance: ${newCredits}
            `;
            document.getElementById('admin-credits-amount').value = 5;
            
            // Send notification to the user who received credits
            window.addNotification(
                '🎁 Free Credits!',
                `You just received ${credits} free credits from GigsCourt. Keep the momentum on!`
            );
            
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

            // Decrement pending requests count (if approved or rejected)
            if (action === 'approve' || action === 'reject') {
                incrementAdminStats('pendingRequests', -1);
            }
            
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
        // Fetch users from Firestore (paginated - 50 at a time)
        const usersRef = collection(window.db, 'users');
        const q = query(usersRef, orderBy('createdAt', 'desc'), limit(50));
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            panel.innerHTML = '<div class="empty-state">No users found</div>';
            return;
        }
        
        const users = [];
        snapshot.forEach(doc => {
            users.push({
                user_id: doc.id,
                ...doc.data()
            });
        });
        
        let html = `<h4>👥 Users (${users.length})</h4><div style="max-height: 400px; overflow-y: auto;">`;
        
        users.forEach(user => {
            const joinDate = user.createdAt ? new Date(user.createdAt).toLocaleDateString() : 'N/A';
            
            html += `
                <div style="padding: 16px; margin-bottom: 12px; background: var(--bg-tertiary); border-radius: 12px;">
                    <div style="font-weight: 600; margin-bottom: 4px;">${user.displayName || 'Anonymous'}</div>
                    <div style="font-size: 13px; color: var(--text-secondary); margin-bottom: 8px;">📧 ${user.email || 'No email'}</div>
                    <div style="display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; font-size: 13px; margin-bottom: 8px;">
                        <div>💰 Credits: ${user.credits || 0}</div>
                        <div>📊 Gigs: ${user.gigCount || 0}</div>
                        <div>⭐ Rating: ${(user.rating || 0).toFixed(1)} (${user.reviewCount || 0})</div>
                        <div>📅 Joined: ${joinDate}</div>
                    </div>
                    <button class="quick-gift-btn" data-user-id="${user.user_id}" data-user-name="${user.displayName || 'User'}" style="width: 100%; padding: 8px; background: var(--accent-orange); color: white; border: none; border-radius: 8px;">🎁 Quick Gift Credits</button>
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
            // Get current credits from Firestore
            const userRef = doc(window.db, 'users', userId);
            const userSnap = await getDoc(userRef);
            
            if (!userSnap.exists()) {
                throw new Error('User not found');
            }
            
            const userData = userSnap.data();
            const currentCredits = userData.credits || 0;
            const newCredits = currentCredits + credits;
            
            // Update user credits
            await updateDoc(userRef, {
                credits: newCredits,
                updatedAt: new Date().toISOString()
            });
            
            // Add transaction record
            const transactionsRef = collection(window.db, 'transactions');
            await addDoc(transactionsRef, {
                userId: userId,
                type: 'admin_gift',
                credits: credits,
                amount: 0,
                reference: 'admin_quick_' + Date.now(),
                createdAt: new Date().toISOString()
            });
            
            window.showToast(`✅ Sent ${credits} credits to ${userName}!`, 'success');
            showUsersListUI();
            
            // Send notification to the user who received credits
            window.addNotification(
                '🎁 Free Credits!',
                `You just received ${credits} free credits from GigsCourt. Keep the momentum on!`
            );
            
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

            // Increment pending requests count
            incrementAdminStats('pendingRequests', 1);
            
        } catch (error) {
            console.error('Service request error:', error);
            window.showToast('Error submitting request', 'error');
        }
    });
    
    // Save services button
    document.getElementById('save-services')?.addEventListener('click', async () => {
        try {
            const servicesString = selectedServices.join(', ');
            
            // Update Firestore
            const userRef = doc(window.db, 'users', window.auth.currentUser.uid);
            await updateDoc(userRef, {
                services: selectedServices,
                updatedAt: new Date().toISOString()
            });
            
            // Also update Supabase provider_locations for search
            try {
                await supabase
                    .from('provider_locations')
                    .update({ services: servicesString })
                    .eq('user_id', window.auth.currentUser.uid);
            } catch (err) {
                console.warn('Could not update location services:', err);
                // Not critical - user can still use app
            }
            
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
                
                // Get current portfolio from Firestore
                const userRef = doc(window.db, 'users', window.auth.currentUser.uid);
                const userSnap = await getDoc(userRef);
                
                if (!userSnap.exists()) {
                    window.showToast('User profile not found', 'error');
                    return;
                }
                
                const userData = userSnap.data();
                const currentPortfolio = userData.portfolio || [];
                
                if (currentPortfolio.length >= 15) {
                    window.showToast('Maximum 15 images. Delete some first.', 'error');
                    return;
                }
                
                currentPortfolio.push(url);
                
                // Update Firestore
                await updateDoc(userRef, {
                    portfolio: currentPortfolio,
                    updatedAt: new Date().toISOString()
                });
                
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
                displayName: document.getElementById('edit-name').value,
                phone: document.getElementById('edit-phone').value,
                bio: document.getElementById('edit-bio').value,
                addressText: document.getElementById('edit-address').value,
                updatedAt: new Date().toISOString()
            };
            
            try {
                // Update Firestore
                const userRef = doc(window.db, 'users', window.auth.currentUser.uid);
                await updateDoc(userRef, updates);
                
                // Update Firebase Auth
                await window.updateProfile(window.auth.currentUser, { displayName: updates.displayName });
                
                // Update local cache
                if (window.currentUserData) {
                    window.currentUserData.displayName = updates.displayName;
                    window.currentUserData.phone = updates.phone;
                    window.currentUserData.bio = updates.bio;
                    window.currentUserData.addressText = updates.addressText;
                }
                
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
        console.log('Navigate event:', e.detail.page, 'skipProfileLoad:', e.detail.skipProfileLoad);
        if (e.detail.page === 'home' && homeFeed) {
            loadHomeFeed().catch(err => console.error('Navigate loadHomeFeed error:', err));
        }
        if (e.detail.page === 'chats' && chatsList) {
            loadChats().catch(err => console.error('Navigate loadChats error:', err));
        }
        if (e.detail.page === 'profile' && profileContent) {
            // Only auto-load profile if we didn't already load it with a specific userId
            if (!e.detail.skipProfileLoad) {
                loadProfile().catch(err => console.error('Navigate loadProfile error:', err));
            }
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
window.uploadImage = uploadImage;
window.showSettings = showSettings;
window.addPortfolioImage = addPortfolioImage;
// Expose additional functions for app-gigs.js
window.getSingleProfileFromSupabase = getSingleProfileFromSupabase;
window.sendPushNotification = sendPushNotification;
window.supabase = supabase;
