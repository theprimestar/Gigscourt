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
let currentRadius = 5;
let currentSearchService = '';
let currentViewMode = 'map';
let featuresInitialized = false;

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

// ========== IMAGE UPLOAD (ImageKit) ==========
async function uploadImage(file, folder = 'profiles') {
    return new Promise((resolve, reject) => {
        const formData = new FormData();
        formData.append('file', file);
        formData.append('fileName', `${Date.now()}_${file.name}`);
        formData.append('folder', `/GigsCourt/${folder}`);
        formData.append('useUniqueFileName', 'true');
        
        fetch(`https://upload.imagekit.io/api/v1/files/upload`, {
            method: 'POST',
            headers: {
                'Authorization': `Basic ${btoa(IMAGEKIT_PUBLIC_KEY + ':')}`
            },
            body: formData
        })
        .then(res => res.json())
        .then(data => {
            if (data.url) resolve(data.url);
            else reject(data);
        })
        .catch(reject);
    });
}

// ========== 7-DAY AUTO-CANCEL ==========
async function checkAndCancelExpiredGigs() {
    try {
        if (!window.db) {
            console.warn('checkAndCancelExpiredGigs: db not ready');
            return;
        }
        const gigsRef = collection(window.db, 'gigs');
        const q = query(
            gigsRef, 
            where('status', '==', 'pending_review'),
            where('expiresAt', '<', new Date().toISOString())
        );
        const expiredGigs = await getDocs(q);
        
        for (const docSnapshot of expiredGigs.docs) {
            await updateDoc(docSnapshot.ref, { status: 'cancelled' });
            const chatRef = doc(window.db, 'chats', docSnapshot.data().chatId);
            await updateDoc(chatRef, { pendingReview: false });
            window.addNotification('Gig Cancelled', 'Client did not review within 7 days. No credits deducted.');
        }
    } catch (error) {
        console.error('checkAndCancelExpiredGigs error:', error);
    }
}

// ========== HOME PAGE ==========
async function loadHomeFeed() {
    if (!homeFeed) return;
    if (!window.db || !window.auth || !window.auth.currentUser) {
        homeFeed.innerHTML = '<div class="empty-state">Loading...</div>';
        return;
    }
    
    try {
        homeFeed.innerHTML = '<div class="loading-spinner"></div>';
        const usersRef = collection(window.db, 'users');
        const usersSnapshot = await getDocs(usersRef);
        let users = [];
        usersSnapshot.forEach(doc => {
            const userData = doc.data();
            if (doc.id !== window.auth.currentUser?.uid && userData.services && userData.services.length > 0) {
                users.push({ id: doc.id, ...userData });
            }
        });
        
        if (currentUserLocation) {
            users.forEach(user => {
                if (user.location) {
                    user.distance = calculateDistance(currentUserLocation.lat, currentUserLocation.lng, user.location.lat, user.location.lng);
                } else {
                    user.distance = Infinity;
                }
            });
            users.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
        }
        
        users.sort((a, b) => {
            const aActive = getActiveStatus(a).active ? 1 : 0;
            const bActive = getActiveStatus(b).active ? 1 : 0;
            if (aActive !== bActive) return bActive - aActive;
            return (b.rating || 0) - (a.rating || 0);
        });
        
        if (users.length === 0) {
            homeFeed.innerHTML = '<div class="empty-state">No providers found nearby</div>';
            return;
        }
        
        homeFeed.innerHTML = users.map(user => `
            <div class="card" data-user-id="${user.id}">
                <div class="card-header">
                    <img class="card-avatar" src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || 'User')}" alt="${user.displayName}">
                    <div class="card-info">
                        <div class="card-name">
                            ${user.displayName || 'Anonymous'}
                            ${getActiveStatus(user).active ? '<span class="active-badge">Active</span>' : ''}
                        </div>
                        <div class="card-rating">
                            <span class="star">★</span> ${(user.rating || 0).toFixed(1)} (${user.gigCount || 0} gigs)
                        </div>
                    </div>
                </div>
                <div class="card-services">
                    ${(user.services || []).slice(0, 3).map(s => `<span class="service-tag">${s}</span>`).join('')}
                </div>
                <div class="card-distance">📍 ${user.distance ? formatDistance(user.distance) : 'Location not set'}</div>
            </div>
        `).join('');
        
        document.querySelectorAll('#home-feed .card').forEach(card => {
            card.addEventListener('click', () => {
                window.haptic('light');
                showUserBottomSheet(card.dataset.userId);
            });
        });
    } catch (error) {
        console.error('loadHomeFeed error:', error);
        homeFeed.innerHTML = '<div class="empty-state">Error loading feed. Pull to refresh.</div>';
    }
}

// ========== BOTTOM SHEET CARD -> EXPAND TO FULL PROFILE ==========
async function showUserBottomSheet(userId) {
    try {
        const userRef = doc(window.db, 'users', userId);
        const userDoc = await getDoc(userRef);
        const user = userDoc.data();
        const activeStatus = getActiveStatus(user);
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
            currentMap.setView([currentUserLocation.lat, currentUserLocation.lng], 13);
            window.L.marker([currentUserLocation.lat, currentUserLocation.lng]).bindPopup('You are here').addTo(currentMap);
            performSearch();
        }, () => performSearch());
    } else {
        performSearch();
    }
}

async function performSearch() {
    if (!window.db) return;
    if (!currentSearchService && searchServiceInput) {
        currentSearchService = searchServiceInput.value;
    }
    try {
        const usersRef = collection(window.db, 'users');
        let q;
        if (currentSearchService) {
            q = query(usersRef, where('services', 'array-contains', currentSearchService));
        } else {
            q = query(usersRef);
        }
        const snapshot = await getDocs(q);
        let users = [];
        snapshot.forEach(doc => {
            const userData = doc.data();
            if (doc.id !== window.auth.currentUser?.uid && userData.services && userData.services.length > 0) {
                users.push({ id: doc.id, ...userData });
            }
        });
        if (currentUserLocation) {
            users.forEach(user => {
                if (user.location) {
                    user.distance = calculateDistance(currentUserLocation.lat, currentUserLocation.lng, user.location.lat, user.location.lng);
                    user.withinRadius = user.distance <= currentRadius * 1000;
                } else {
                    user.withinRadius = false;
                }
            });
            users = users.filter(u => u.withinRadius);
            users.sort((a, b) => (a.distance || Infinity) - (b.distance || Infinity));
        }
        users.sort((a, b) => {
            const aActive = getActiveStatus(a).active ? 1 : 0;
            const bActive = getActiveStatus(b).active ? 1 : 0;
            if (aActive !== bActive) return bActive - aActive;
            return (b.rating || 0) - (a.rating || 0);
        });
        currentListViewData = users;
        updateMapMarkers(users);
        updateListView(users);
    } catch (error) {
        console.error('performSearch error:', error);
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
            performSearch();
        });
    }
    if (radiusSlider && radiusValue) {
        radiusSlider.addEventListener('input', (e) => {
            currentRadius = parseInt(e.target.value);
            radiusValue.textContent = currentRadius;
            performSearch();
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

// ========== CHAT SYSTEM (with Delete Message) ==========
async function loadChats() {
    if (!chatsList) return;
    if (!window.db || !window.auth || !window.auth.currentUser) {
        chatsList.innerHTML = '<div class="empty-state">Loading...</div>';
        return;
    }
    try {
        chatsList.innerHTML = '<div class="loading-spinner"></div>';
        const chatsRef = collection(window.db, 'chats');
        const q = query(
            chatsRef, 
            where('participants', 'array-contains', window.auth.currentUser.uid),
            orderBy('lastMessageTime', 'desc')
        );
        const chatsSnapshot = await getDocs(q);
        
        if (chatsSnapshot.empty) {
            chatsList.innerHTML = '<div class="empty-state">No messages yet</div>';
            return;
        }
        const chats = [];
        for (const chatDoc of chatsSnapshot.docs) {
            const chat = { id: chatDoc.id, ...chatDoc.data() };
            const otherUserId = chat.participants.find(p => p !== window.auth.currentUser.uid);
            const userRef = doc(window.db, 'users', otherUserId);
            const userDoc = await getDoc(userRef);
            const userData = userDoc.data();
            chats.push({ ...chat, otherUser: { id: otherUserId, ...userData } });
        }
        chatsList.innerHTML = chats.map(chat => `
            <div class="chat-item" data-chat-id="${chat.id}" data-user-id="${chat.otherUser.id}">
                <img class="chat-avatar" src="${chat.otherUser.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(chat.otherUser.displayName || 'User')}" alt="">
                <div class="chat-details">
                    <div class="chat-name">${chat.otherUser.displayName || 'User'}</div>
                    <div class="chat-last-message">${chat.lastMessage || 'No messages'}</div>
                </div>
                <div class="chat-meta">
                    <div class="chat-time">${chat.lastMessageTime ? new Date(chat.lastMessageTime).toLocaleTimeString([], {hour:'2-digit', minute:'2-digit'}) : ''}</div>
                    ${chat.pendingReview ? '<div class="pending-badge">Pending review</div>' : ''}
                </div>
            </div>
        `).join('');
        document.querySelectorAll('.chat-item').forEach(item => {
            item.addEventListener('click', () => openChat(item.dataset.userId, item.dataset.chatId));
        });
    } catch (error) {
        console.error('loadChats error:', error);
        chatsList.innerHTML = '<div class="empty-state">Error loading chats</div>';
    }
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
    try {
        const userRef = doc(window.db, 'users', userId);
        const userDoc = await getDoc(userRef);
        const userData = userDoc.data();
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
            <button id="register-gig-chat" class="btn-secondary" style="width: 100%; margin-top: 12px; padding: 12px; background: var(--accent-orange); color: white;">📋 Register Gig with this person</button>
            <div id="pending-review-toast" style="display: none; margin-top: 12px; padding: 12px; background: var(--warning-yellow); border-radius: 10px; text-align: center;">⚠️ You have a pending review for a gig with this provider</div>
        `);
        document.getElementById('close-chat').addEventListener('click', () => window.closeBottomSheet());
        const messagesDiv = document.getElementById('chat-messages');
        const input = document.getElementById('chat-input');
        document.getElementById('send-message').addEventListener('click', () => sendMessage(chat, input.value));
        input.addEventListener('keypress', (e) => { if (e.key === 'Enter') sendMessage(chat, input.value); });
        document.getElementById('register-gig-chat').addEventListener('click', () => registerGig(chat, userId));
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
        checkPendingReview(chat, userId);
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
        await updateDoc(chatRef, {
            lastMessage: text,
            lastMessageTime: new Date().toISOString()
        });
        document.getElementById('chat-input').value = '';
        window.haptic('light');
    } catch (error) {
        console.error('sendMessage error:', error);
        window.showToast('Error sending message', 'error');
    }
}

async function checkPendingReview(chatId, userId) {
    try {
        const gigsRef = collection(window.db, 'gigs');
        const q = query(
            gigsRef,
            where('providerId', '==', window.auth.currentUser.uid),
            where('clientId', '==', userId),
            where('status', '==', 'pending_review')
        );
        const pendingGig = await getDocs(q);
        const toast = document.getElementById('pending-review-toast');
        if (!pendingGig.empty && toast) {
            toast.style.display = 'block';
        }
    } catch (error) {
        console.error('checkPendingReview error:', error);
    }
}

// ========== REGISTER GIG ==========
async function registerGig(chatId, clientId) {
    try {
        const userRef = doc(window.db, 'users', window.auth.currentUser.uid);
        const userDoc = await getDoc(userRef);
        if ((userDoc.data().credits || 0) < 1) {
            window.showToast('You need credits to register a gig. Buy credits first.', 'error');
            buyCredits();
            return;
        }
        const gigsRef = collection(window.db, 'gigs');
        await addDoc(gigsRef, {
            providerId: window.auth.currentUser.uid,
            clientId: clientId,
            chatId: chatId,
            status: 'pending_review',
            createdAt: new Date().toISOString(),
            expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
        });
        const chatRef = doc(window.db, 'chats', chatId);
        await updateDoc(chatRef, { pendingReview: true });
        window.addNotification('Gig Registered', 'Client has been notified to review you');
        window.showToast('Gig registered! Client will review within 7 days.');
        window.haptic('heavy');
    } catch (error) {
        console.error('registerGig error:', error);
        window.showToast('Error registering gig', 'error');
    }
}

// ========== REVIEW SYSTEM ==========
async function submitReview(providerId, clientId, rating, reviewText) {
    try {
        const reviewId = `${clientId}_${providerId}`;
        const reviewRef = doc(window.db, 'reviews', reviewId);
        await setDoc(reviewRef, {
            providerId: providerId,
            clientId: clientId,
            rating: rating,
            review: reviewText,
            updatedAt: new Date().toISOString()
        });
        
        const reviewsRef = collection(window.db, 'reviews');
        const q = query(reviewsRef, where('providerId', '==', providerId));
        const allReviews = await getDocs(q);
        let sum = 0, count = 0;
        allReviews.forEach(doc => {
            sum += doc.data().rating;
            count++;
        });
        const avgRating = sum / count;
        
        const userRef = doc(window.db, 'users', providerId);
        await updateDoc(userRef, {
            rating: avgRating,
            gigCount: increment(1),
            credits: increment(-1),
            lastGigDate: new Date().toISOString(),
            monthlyGigCount: increment(1)
        });
        
        const gigsRef = collection(window.db, 'gigs');
        const gigsQuery = query(
            gigsRef,
            where('providerId', '==', providerId),
            where('clientId', '==', clientId),
            where('status', '==', 'pending_review')
        );
        const gigs = await getDocs(gigsQuery);
        for (const gigDoc of gigs.docs) {
            await updateDoc(gigDoc.ref, { status: 'completed', completedAt: new Date().toISOString() });
        }
        
        const chatRef = doc(window.db, 'chats', currentChatId);
        await updateDoc(chatRef, { pendingReview: false });
        window.showToast(`Review submitted! ${rating} stars. Thank you!`);
        window.haptic('heavy');
    } catch (error) {
        console.error('submitReview error:', error);
        window.showToast('Error submitting review', 'error');
    }
}

async function showReviews(providerId) {
    try {
        const reviewsRef = collection(window.db, 'reviews');
        const q = query(reviewsRef, where('providerId', '==', providerId));
        const reviews = await getDocs(q);
        if (reviews.empty) {
            window.showToast('No reviews yet');
            return;
        }
        let reviewsHtml = '<h3 style="margin-bottom: 16px;">Reviews</h3>';
        reviews.forEach(doc => {
            const review = doc.data();
            reviewsHtml += `
                <div style="padding: 12px; border-bottom: 1px solid var(--border-light);">
                    <div style="font-weight: 600;">★ ${review.rating}</div>
                    <p style="color: var(--text-secondary);">${review.review}</p>
                    <div style="font-size: 11px; color: var(--text-muted);">${new Date(review.updatedAt).toLocaleDateString()}</div>
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
                            const userRef = doc(window.db, 'users', window.auth.currentUser.uid);
                            await updateDoc(userRef, {
                                credits: increment(credits)
                            });
                            const transactionsRef = collection(window.db, 'transactions');
                            await addDoc(transactionsRef, {
                                userId: window.auth.currentUser.uid,
                                type: 'credit_purchase',
                                credits: credits,
                                amount: price,
                                reference: response.reference,
                                createdAt: new Date().toISOString()
                            });
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
        const transactionsRef = collection(window.db, 'transactions');
        const q = query(
            transactionsRef,
            where('userId', '==', window.auth.currentUser.uid),
            orderBy('createdAt', 'desc')
        );
        const transactions = await getDocs(q);
        if (transactions.empty) {
            window.showToast('No transactions yet');
            return;
        }
        let html = '<h3 style="margin-bottom: 16px;">Transaction History</h3>';
        transactions.forEach(doc => {
            const t = doc.data();
            html += `
                <div style="padding: 12px; border-bottom: 1px solid var(--border-light);">
                    <div><strong>${t.type === 'credit_purchase' ? '💰 Purchased' : '📋 Gig Used'}</strong></div>
                    <div>${t.credits} credits • ₦${t.amount?.toLocaleString() || '0'}</div>
                    <div style="font-size: 11px; color: var(--text-muted);">${new Date(t.createdAt).toLocaleDateString()}</div>
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
async function loadProfile(userId = null) {
    const targetId = userId || window.auth.currentUser?.uid;
    if (!targetId || !profileContent) return;
    if (!window.db) {
        profileContent.innerHTML = '<div class="empty-state">Loading...</div>';
        return;
    }
    try {
        profileContent.innerHTML = '<div class="loading-spinner"></div>';
        const userRef = doc(window.db, 'users', targetId);
        const userDoc = await getDoc(userRef);
        if (!userDoc.exists) {
            profileContent.innerHTML = '<div class="empty-state">User not found</div>';
            return;
        }
        const user = { id: userDoc.id, ...userDoc.data() };
        const isOwnProfile = targetId === window.auth.currentUser?.uid;
        const activeStatus = getActiveStatus(user);
        profileContent.innerHTML = `
            <div class="profile-header">
                <img class="profile-avatar" src="${user.photoURL || 'https://ui-avatars.com/api/?name=' + encodeURIComponent(user.displayName || 'User')}" alt="" data-user-id="${user.id}">
                <h2 class="profile-name">${user.displayName || 'Anonymous'}</h2>
                <p class="profile-bio">${user.bio || 'No bio yet'}</p>
                ${activeStatus.active ? '<span class="active-badge">Active this week</span>' : ''}
            </div>
            <div class="profile-stats">
                <div class="stat" data-stat="gigs">
                    <div class="stat-number">${user.gigCount || 0}</div>
                    <div class="stat-label">Gigs</div>
                </div>
                <div class="stat" data-stat="rating">
                    <div class="stat-number">★ ${(user.rating || 0).toFixed(1)}</div>
                    <div class="stat-label">Rating</div>
                </div>
                <div class="stat" data-stat="credits">
                    <div class="stat-number">${user.credits || 0}</div>
                    <div class="stat-label">Credits</div>
                </div>
            </div>
            <div class="profile-address">📍 ${user.addressText || 'No address set'}</div>
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
                <div class="card-services" id="profile-services-list">${(user.services || []).map(s => `<span class="service-tag">${s}</span>`).join('')}</div>
                ${isOwnProfile ? '<button id="edit-services-btn" class="btn-secondary" style="margin-top: 12px;">Edit Services</button>' : ''}
            </div>
            <div class="portfolio-section">
                <div class="section-title">Portfolio</div>
                <div class="portfolio-grid" id="portfolio-grid">
                    ${(user.portfolio || []).map(img => `<img src="${img}" class="portfolio-item">`).join('')}
                </div>
                ${isOwnProfile ? '<button id="add-portfolio-btn" class="btn-secondary" style="margin-top: 12px;">+ Add Portfolio Image (Max 15)</button>' : ''}
            </div>
        `;
        if (isOwnProfile) {
            document.getElementById('edit-profile-btn')?.addEventListener('click', editProfile);
            document.getElementById('register-gig-profile-btn')?.addEventListener('click', showRecentChatsForGig);
            document.getElementById('buy-credits-btn')?.addEventListener('click', buyCredits);
            document.getElementById('settings-btn')?.addEventListener('click', showSettings);
            document.getElementById('edit-services-btn')?.addEventListener('click', editServices);
            document.getElementById('add-portfolio-btn')?.addEventListener('click', addPortfolioImage);
        } else {
            document.getElementById('contact-now-btn')?.addEventListener('click', () => openChat(user.id));
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
            const userRef = doc(window.db, 'users', window.auth.currentUser.uid);
            await updateDoc(userRef, { services: selectedServices });
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
    try {
        const userRef = doc(window.db, 'users', window.auth.currentUser.uid);
        const userDoc = await getDoc(userRef);
        const currentPortfolio = userDoc.data().portfolio || [];
        if (currentPortfolio.length >= 15) {
            window.showToast('Maximum 15 images. Delete some first.', 'error');
            return;
        }
        const input = document.createElement('input');
        input.type = 'file';
        input.accept = 'image/*';
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (file) {
                window.showToast('Uploading...');
                const url = await uploadImage(file, 'portfolio');
                currentPortfolio.push(url);
                await updateDoc(userRef, { portfolio: currentPortfolio });
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
        const userRef = doc(window.db, 'users', window.auth.currentUser.uid);
        const userDoc = await getDoc(userRef);
        const user = userDoc.data();
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
                    await updateDoc(userRef, { photoURL: url });
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
                addressText: document.getElementById('edit-address').value
            };
            await updateDoc(userRef, updates);
            await window.updateProfile(window.auth.currentUser, { displayName: updates.displayName });
            window.closeBottomSheet();
            window.showToast('Profile updated!');
            loadProfile();
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
            const userRef = doc(window.db, 'users', otherId);
            const userDoc = await getDoc(userRef);
            recentUsers.push({ id: otherId, ...userDoc.data(), chatId: chatDoc.id });
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
    window.openBottomSheet(`
        <h3 style="margin-bottom: 16px;">Settings</h3>
        <button id="change-password-btn" class="btn-secondary" style="width: 100%; margin-bottom: 12px;">Change Password</button>
        <button id="deactivate-btn" class="btn-secondary" style="width: 100%; margin-bottom: 12px; color: var(--error-red);">Deactivate Account</button>
        <button id="logout-btn" class="btn-secondary" style="width: 100%;">Logout</button>
    `);
    document.getElementById('logout-btn')?.addEventListener('click', async () => {
        await window.signOut(window.auth);
        window.closeBottomSheet();
        window.location.reload();
    });
    document.getElementById('deactivate-btn')?.addEventListener('click', async () => {
        try {
            const userRef = doc(window.db, 'users', window.auth.currentUser.uid);
            await updateDoc(userRef, {
                deactivatedAt: new Date().toISOString(),
                deactivateExpires: new Date(Date.now() + 14 * 24 * 60 * 60 * 1000).toISOString()
            });
            window.showToast('Account deactivated. Will be deleted after 14 days.');
            await window.signOut(window.auth);
            window.location.reload();
        } catch (error) {
            console.error('deactivate error:', error);
            window.showToast('Error deactivating account', 'error');
        }
    });
    document.getElementById('change-password-btn')?.addEventListener('click', async () => {
        window.showToast('Password reset email sent');
        await window.sendPasswordResetEmail(window.auth, window.auth.currentUser.email);
    });
}

// ========== INITIALIZE FEATURES (only after appReady) ==========
async function initFeatures() {
    if (featuresInitialized) return;
    featuresInitialized = true;
    
    // Get DOM elements - NO 'let' here, assign to existing global variables
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
    
    // Run initial data loads with error handling
    try {
        await checkAndCancelExpiredGigs();
    } catch (e) {
        console.error('checkAndCancelExpiredGigs failed:', e);
    }
    
    try {
        if (homeFeed) await loadHomeFeed();
    } catch (e) {
        console.error('loadHomeFeed failed:', e);
        if (homeFeed) homeFeed.innerHTML = '<div class="empty-state">Failed to load feed. Pull to refresh.</div>';
    }
    
    try {
        if (searchServiceInput) setupSearch();
    } catch (e) {
        console.error('setupSearch failed:', e);
    }
    
    try {
        if (mapContainer && window.L) await initMap();
    } catch (e) {
        console.error('initMap failed:', e);
    }
    
    try {
        if (chatsList) await loadChats();
    } catch (e) {
        console.error('loadChats failed:', e);
        if (chatsList) chatsList.innerHTML = '<div class="empty-state">Failed to load chats</div>';
    }
    
    try {
        if (profileContent) await loadProfile();
    } catch (e) {
        console.error('loadProfile failed:', e);
        if (profileContent) profileContent.innerHTML = '<div class="empty-state">Failed to load profile</div>';
    }
    
    // Set up navigation event listener for tab changes
    window.addEventListener('navigate', (e) => {
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
}

// ========== WAIT FOR appReady EVENT ==========
document.addEventListener('DOMContentLoaded', () => {
    // If app is already ready (rare case), init immediately
    if (window.db && window.auth && window.currentUser !== undefined) {
        initFeatures();
    } else {
        // Wait for appReady event from core
        window.addEventListener('appReady', () => {
            initFeatures();
        });
    }
});

// Expose functions globally
window.loadHomeFeed = loadHomeFeed;
window.loadProfile = loadProfile;
window.loadChats = loadChats;
window.performSearch = performSearch;
window.buyCredits = buyCredits;
window.submitReview = submitReview;
window.registerGig = registerGig;
window.uploadImage = uploadImage;
