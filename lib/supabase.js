// ========================================
// GigsCourt Supabase Connection
// WITH RACE CONDITION PROTECTION
// ========================================

// 🔴 REPLACE THESE WITH YOUR ACTUAL SUPABASE KEYS 🔴
const SUPABASE_URL = "https://qifzdrkpxzosdturjpex.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QfKJ4jT8u_2HuUKmW-xvbQ_9acJvZw-";
// 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴

// Global variable for Supabase client
let _supabaseClient = null;
let _initAttempts = 0;
const MAX_INIT_ATTEMPTS = 10;
const INIT_DELAY_MS = 100;

// ===== Safe initialization with retry logic =====
function getSupabaseClient() {
    if (_supabaseClient) return _supabaseClient;
    
    // Check if Supabase CDN has loaded
    if (!window.supabase || typeof window.supabase.createClient !== 'function') {
        if (_initAttempts < MAX_INIT_ATTEMPTS) {
            _initAttempts++;
            console.log(`Waiting for Supabase CDN... Attempt ${_initAttempts}/${MAX_INIT_ATTEMPTS}`);
            
            // Sync delay - block until ready (for critical path)
            const startTime = Date.now();
            while (!window.supabase && (Date.now() - startTime) < 3000) {
                // Busy wait for Supabase (critical for page load)
            }
            
            if (!window.supabase) {
                // Async fallback
                return new Promise((resolve) => {
                    setTimeout(() => {
                        resolve(getSupabaseClient());
                    }, INIT_DELAY_MS);
                });
            }
        }
        
        if (!window.supabase) {
            throw new Error('Supabase CDN failed to load. Please check your internet connection.');
        }
    }
    
    _supabaseClient = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('Supabase client initialized successfully');
    return _supabaseClient;
}

// ===== Geohash Functions =====
function encodeGeohash(lat, lng, precision = 6) {
    const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
    let latMin = -90, latMax = 90;
    let lngMin = -180, lngMax = 180;
    let geohash = "";
    let isEven = true;
    let bit = 0;
    let ch = 0;
    
    while (geohash.length < precision) {
        if (isEven) {
            const mid = (lngMin + lngMax) / 2;
            if (lng > mid) {
                ch |= (1 << bit);
                lngMin = mid;
            } else {
                lngMax = mid;
            }
        } else {
            const mid = (latMin + latMax) / 2;
            if (lat > mid) {
                ch |= (1 << bit);
                latMin = mid;
            } else {
                latMax = mid;
            }
        }
        isEven = !isEven;
        bit++;
        
        if (bit === 5) {
            geohash += BASE32[ch];
            bit = 0;
            ch = 0;
        }
    }
    return geohash;
}

// ===== Nearby Query =====
async function getNearbyProfiles(centerLat, centerLng, radiusKm = 10) {
    const client = await getSupabaseClient();
    const centerGeohash = encodeGeohash(centerLat, centerLng, 6);
    const geohashPrefix = centerGeohash.substring(0, 4);
    
    const { data, error } = await client
        .from('profiles')
        .select('*')
        .like('geohash', `${geohashPrefix}%`)
        .limit(50);
    
    if (error) throw error;
    return data;
}

// ===== Authentication =====
async function signUp(email, password, userData) {
    const client = await getSupabaseClient();
    const { data, error } = await client.auth.signUp({
        email,
        password,
        options: { data: userData }
    });
    if (error) throw error;
    
    if (data.user) {
        await client.from('profiles').insert({
            id: data.user.id,
            username: userData.username,
            full_name: userData.full_name,
            credits: 6
        });
    }
    return data;
}

async function signIn(email, password) {
    const client = await getSupabaseClient();
    const { data, error } = await client.auth.signInWithPassword({
        email,
        password
    });
    if (error) throw error;
    return data;
}

async function signOut() {
    const client = await getSupabaseClient();
    const { error } = await client.auth.signOut();
    if (error) throw error;
}

async function getCurrentUser() {
    const client = await getSupabaseClient();
    const { data: { user }, error } = await client.auth.getUser();
    if (error || !user) return null;
    
    const { data: profile } = await client
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
    
    return { user, profile };
}

async function getProfile(userId) {
    const client = await getSupabaseClient();
    const { data, error } = await client
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    if (error) throw error;
    return data;
}

async function updateProfile(userId, updates) {
    const client = await getSupabaseClient();
    const { data, error } = await client
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function updateGeohash(userId, lat, lng) {
    const client = await getSupabaseClient();
    const geohash = encodeGeohash(lat, lng, 6);
    const { error } = await client
        .from('profiles')
        .update({ geohash })
        .eq('id', userId);
    if (error) throw error;
    return geohash;
}

async function getGigs(filters = {}, page = 0, limit = 10) {
    const client = await getSupabaseClient();
    let query = client
        .from('gigs')
        .select('*, profiles(*)')
        .eq('is_active', true)
        .range(page * limit, (page + 1) * limit - 1)
        .order('created_at', { ascending: false });
    
    if (filters.category) {
        query = query.eq('category', filters.category);
    }
    if (filters.userId) {
        query = query.eq('user_id', filters.userId);
    }
    
    const { data, error } = await query;
    if (error) throw error;
    return data;
}

async function createGig(userId, gigData) {
    const client = await getSupabaseClient();
    const { data, error } = await client
        .from('gigs')
        .insert({
            user_id: userId,
            title: gigData.title,
            description: gigData.description,
            category: gigData.category,
            images: gigData.images || [],
            price_range: gigData.price_range
        })
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function getConversations(userId) {
    const client = await getSupabaseClient();
    const { data, error } = await client
        .from('messages')
        .select('*, sender:profiles!sender_id(*), receiver:profiles!receiver_id(*)')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false });
    if (error) throw error;
    
    const conversations = new Map();
    for (const msg of data) {
        const partnerId = msg.sender_id === userId ? msg.receiver_id : msg.sender_id;
        if (!conversations.has(partnerId)) {
            conversations.set(partnerId, {
                partner: msg.sender_id === userId ? msg.receiver : msg.sender,
                lastMessage: msg.content || msg.image_url || msg.voice_note_url,
                lastMessageTime: msg.created_at,
                unread: !msg.is_read && msg.receiver_id === userId
            });
        }
    }
    return Array.from(conversations.values());
}

async function sendMessage(senderId, receiverId, content, type = 'text') {
    const client = await getSupabaseClient();
    const messageData = { sender_id: senderId, receiver_id: receiverId };
    if (type === 'text') messageData.content = content;
    if (type === 'image') messageData.image_url = content;
    if (type === 'voice') messageData.voice_note_url = content;
    
    const { data, error } = await client
        .from('messages')
        .insert(messageData)
        .select()
        .single();
    if (error) throw error;
    return data;
}

function subscribeToMessages(userId, onMessage) {
    return getSupabaseClient().then(client => {
        return client
            .channel('messages')
            .on('postgres_changes', {
                event: 'INSERT',
                schema: 'public',
                table: 'messages',
                filter: `receiver_id=eq.${userId}`
            }, (payload) => onMessage(payload.new))
            .subscribe();
    });
}

async function submitRating(fromUserId, toUserId, gigId, rating, review) {
    const client = await getSupabaseClient();
    const { data, error } = await client
        .from('ratings')
        .insert({
            from_user_id: fromUserId,
            to_user_id: toUserId,
            gig_id: gigId,
            rating: rating,
            review: review
        })
        .select()
        .single();
    if (error) throw error;
    
    if (window.canvasConfetti) {
        window.canvasConfetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#d35400', '#e03a3a']
        });
    }
    return data;
}

async function getUserRatings(userId) {
    const client = await getSupabaseClient();
    const { data, error } = await client
        .from('ratings')
        .select('*, from:profiles!from_user_id(*)')
        .eq('to_user_id', userId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    
    const average = data.reduce((sum, r) => sum + r.rating, 0) / (data.length || 1);
    return { ratings: data, average };
}

async function getCredits(userId) {
    const client = await getSupabaseClient();
    const { data, error } = await client
        .from('profiles')
        .select('credits')
        .eq('id', userId)
        .single();
    if (error) throw error;
    return data.credits;
}

async function deductCredit(userId, amount = 1) {
    const client = await getSupabaseClient();
    const profile = await getProfile(userId);
    const newCredits = (profile.credits || 0) - amount;
    const { error } = await client
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', userId);
    if (error) throw error;
    return newCredits;
}

async function checkIsAdmin(userId) {
    const client = await getSupabaseClient();
    const { data, error } = await client
        .from('profiles')
        .select('is_admin')
        .eq('id', userId)
        .single();
    if (error) return false;
    return data.is_admin === true;
}

async function broadcastNotification(title, body) {
    console.log("Broadcast:", title, body);
    return true;
}

// Export to global
window.SupabaseAPI = {
    get client() { return getSupabaseClient(); },
    encodeGeohash,
    getNearbyProfiles,
    signUp,
    signIn,
    signOut,
    getCurrentUser,
    getProfile,
    updateProfile,
    updateGeohash,
    getGigs,
    createGig,
    getConversations,
    sendMessage,
    subscribeToMessages,
    submitRating,
    getUserRatings,
    getCredits,
    deductCredit,
    checkIsAdmin,
    broadcastNotification
};
