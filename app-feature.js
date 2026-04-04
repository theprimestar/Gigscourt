// ========================================
// GigsCourt - Features Module
// Map, Chat, Gigs, Credits, Reviews, Profile
// ========================================

// ========== DOM ELEMENTS ==========
let homeFeed, searchServiceInput, radiusSlider, radiusValue, mapViewBtn, listViewBtn, mapContainer, searchListView, searchListFeed, chatsList, profileContent;

// ========== STATE ==========
let currentMap = null;
let currentMarkers = [];
let currentListViewData = [];
let currentChatUser = null;
let currentMessagesUnsubscribe = null;
let currentUserLocation = null;
let currentRadius = 5;
let currentSearchService = '';
let currentViewMode = 'map';

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
    return { active: false, text: 'Active' };
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

// ========== HOME PAGE (Discovery) ==========
async function loadHomeFeed() {
    if (!homeFeed) return;
    homeFeed.innerHTML = '<div class="loading-spinner"></div>';
    const usersSnapshot = await window.db.collection('users').where('services', 'array-contains-any', window.PRESET_SERVICES.slice(0, 5)).get();
    let users = [];
    usersSnapshot.forEach(doc => {
        if (doc.id !== window.auth.currentUser?.uid) {
            users.push({ id: doc.id, ...doc.data() });
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
        card.addEventListener('click', () => viewUserProfile(card.dataset.userId));
    });
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
    if (!currentSearchService && searchServiceInput) {
        currentSearchService = searchServiceInput.value;
    }
    let query = window.db.collection('users');
    if (currentSearchService) {
        query = query.where('services', 'array-contains', currentSearchService);
    }
    const snapshot = await query.get();
    let users = [];
    snapshot.forEach(doc => {
        if (doc.id !== window.auth.currentUser?.uid) {
            users.push({ id: doc.id, ...doc.data() });
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
            marker.on('click', () => viewUserProfile(user.id));
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
        card.addEventListener('click', () => viewUserProfile(card.dataset.userId));
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
        });
        listViewBtn.addEventListener('click', () => {
            currentViewMode = 'list';
            listViewBtn.classList.add('active');
            mapViewBtn.classList.remove('active');
            mapContainer.classList.add('hidden');
            searchListView.classList.remove('hidden');
        });
    }
}

// ========== CHAT SYSTEM ==========
async function loadChats() {
    if (!chatsList) return;
    chatsList.innerHTML = '<div class="loading-spinner"></div>';
    const chatsSnapshot = await window.db.collection('chats')
        .where('participants', 'array-contains', window.auth.currentUser.uid)
        .orderBy('lastMessageTime', 'desc')
        .get();
    if (chatsSnapshot.empty) {
        chatsList.innerHTML = '<div class="empty-state">No messages yet</div>';
        return;
    }
    const chats = [];
    for (const chatDoc of chatsSnapshot.docs) {
        const chat = { id: chatDoc.id, ...chatDoc.data() };
        const otherUserId = chat.participants.find(p => p !== window.auth.currentUser.uid);
        const userDoc = await window.db.collection('users').doc(otherUserId).get();
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
}

async function openChat(userId, chatId = null) {
    currentChatUser = userId;
    let chat = chatId;
    if (!chat) {
        const existingChat = await window.db.collection('chats')
            .where('participants', 'array-contains', window.auth.currentUser.uid)
            .get();
        let found = null;
        existingChat.forEach(doc => {
            if (doc.data().participants.includes(userId)) found = doc.id;
        });
        chat = found;
        if (!chat) {
            const newChatRef = await window.db.collection('chats').add({
                participants: [window.auth.currentUser.uid, userId],
                createdAt: new Date().toISOString(),
                lastMessageTime: new Date().toISOString(),
                lastMessage: ''
            });
            chat = newChatRef.id;
        }
    }
    const userDoc = await window.db.collection('users').doc(userId).get();
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
    currentMessagesUnsubscribe = window.db.collection('chats').doc(chat).collection('messages')
        .orderBy('timestamp', 'asc')
        .onSnapshot(snapshot => {
            messagesDiv.innerHTML = '';
            snapshot.forEach(doc => {
                const msg = doc.data();
                const isMe = msg.senderId === window.auth.currentUser.uid;
                messagesDiv.innerHTML += `
                    <div style="display: flex; justify-content: ${isMe ? 'flex-end' : 'flex-start'};">
                        <div style="max-width: 70%; padding: 10px 14px; border-radius: 18px; background: ${isMe ? 'var(--accent-orange)' : 'var(--bg-secondary)'}; color: ${isMe ? 'white' : 'var(--text-primary)'};">
                            ${msg.text}
                            ${msg.imageUrl ? `<img src="${msg.imageUrl}" style="max-width: 200px; border-radius: 10px; margin-top: 8px;">` : ''}
                            <div style="font-size: 10px; opacity: 0.7; margin-top: 4px;">${new Date(msg.timestamp).toLocaleTimeString()}</div>
                        </div>
                    </div>
                `;
            });
            messagesDiv.scrollTop = messagesDiv.scrollHeight;
        });
    checkPendingReview(chat, userId);
}

async function sendMessage(chatId, text) {
    if (!text.trim()) return;
    await window.db.collection('chats').doc(chatId).collection('messages').add({
        senderId: window.auth.currentUser.uid,
        text: text,
        timestamp: new Date().toISOString()
    });
    await window.db.collection('chats').doc(chatId).update({
        lastMessage: text,
        lastMessageTime: new Date().toISOString()
    });
    document.getElementById('chat-input').value = '';
}

async function checkPendingReview(chatId, userId) {
    const pendingGig = await window.db.collection('gigs')
        .where('providerId', '==', window.auth.currentUser.uid)
        .where('clientId', '==', userId)
        .where('status', '==', 'pending_review')
        .get();
    const toast = document.getElementById('pending-review-toast');
    if (!pendingGig.empty && toast) {
        toast.style.display = 'block';
    }
}

// ========== REGISTER GIG ==========
async function registerGig(chatId, clientId) {
    const userData = await window.db.collection('users').doc(window.auth.currentUser.uid).get();
    if ((userData.data().credits || 0) < 1) {
        window.showToast('You need credits to register a gig. Buy credits first.', 'error');
        buyCredits();
        return;
    }
    await window.db.collection('gigs').add({
        providerId: window.auth.currentUser.uid,
        clientId: clientId,
        chatId: chatId,
        status: 'pending_review',
        createdAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString()
    });
    await window.db.collection('chats').doc(chatId).update({ pendingReview: true });
    window.addNotification('Gig Registered', 'Client has been notified to review you', `review/${clientId}`);
    window.showToast('G
