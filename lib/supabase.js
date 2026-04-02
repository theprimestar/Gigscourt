// ========================================
// GigsCourt Supabase Connection
// ========================================

// 🔴 REPLACE THESE WITH YOUR ACTUAL SUPABASE KEYS 🔴
const SUPABASE_URL = "https://qifzdrkpxzosdturjpex.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QfKJ4jT8u_2HuUKmW-xvbQ_9acJvZw-";
// 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴

// Initialize Supabase client (use different variable name)
const _supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

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
    const centerGeohash = encodeGeohash(centerLat, centerLng, 6);
    const geohashPrefix = centerGeohash.substring(0, 4);
    
    const { data, error } = await _supabase
        .from('profiles')
        .select('*')
        .like('geohash', `${geohashPrefix}%`)
        .limit(50);
    
    if (error) throw error;
    return data;
}

// ===== Authentication =====
async function signUp(email, password, userData) {
    const { data, error } = await _supabase.auth.signUp({
        email,
        password,
        options: { data: userData }
    });
    if (error) throw error;
    
    if (data.user) {
        await _supabase.from('profiles').insert({
            id: data.user.id,
            username: userData.username,
            full_name: userData.full_name,
            credits: 6
        });
    }
    return data;
}

async function signIn(email, password) {
    const { data, error } = await _supabase.auth.signInWithPassword({
        email,
        password
    });
    if (error) throw error;
    return data;
}

async function signOut() {
    const { error } = await _supabase.auth.signOut();
    if (error) throw error;
}

async function getCurrentUser() {
    const { data: { user }, error } = await _supabase.auth.getUser();
    if (error || !user) return null;
    
    const { data: profile } = await _supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
    
    return { user, profile };
}

async function getProfile(userId) {
    const { data, error } = await _supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    if (error) throw error;
    return data;
}

async function updateProfile(userId, updates) {
    const { data, error } = await _supabase
        .from('profiles')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();
    if (error) throw error;
    return data;
}

async function updateGeohash(userId, lat, lng) {
    const geohash = encodeGeohash(lat, lng, 6);
    const { error } = await _supabase
        .from('profiles')
        .update({ geohash })
        .eq('id', userId);
    if (error) throw error;
    return geohash;
}

async function getGigs(filters = {}, page = 0, limit = 10) {
    let query = _supabase
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
    const { data, error } = await _supabase
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
    const { data, error } = await _supabase
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
    const messageData = { sender_id: senderId, receiver_id: receiverId };
    if (type === 'text') messageData.content = content;
    if (type === 'image') messageData.image_url = content;
    if (type === 'voice') messageData.voice_note_url = content;
    
    const { data, error } = await _supabase
        .from('messages')
        .insert(messageData)
        .select()
        .single();
    if (error) throw error;
    return data;
}

function subscribeToMessages(userId, onMessage) {
    return _supabase
        .channel('messages')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `receiver_id=eq.${userId}`
        }, (payload) => onMessage(payload.new))
        .subscribe();
}

async function submitRating(fromUserId, toUserId, gigId, rating, review) {
    const { data, error } = await _supabase
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
    const { data, error } = await _supabase
        .from('ratings')
        .select('*, from:profiles!from_user_id(*)')
        .eq('to_user_id', userId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    
    const average = data.reduce((sum, r) => sum + r.rating, 0) / (data.length || 1);
    return { ratings: data, average };
}

async function getCredits(userId) {
    const { data, error } = await _supabase
        .from('profiles')
        .select('credits')
        .eq('id', userId)
        .single();
    if (error) throw error;
    return data.credits;
}

async function deductCredit(userId, amount = 1) {
    const profile = await getProfile(userId);
    const newCredits = (profile.credits || 0) - amount;
    const { error } = await _supabase
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', userId);
    if (error) throw error;
    return newCredits;
}

async function checkIsAdmin(userId) {
    const { data, error } = await _supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', userId)
        .single();
    if (error) return false;
    return data.is_admin === true;
}

async function broadcastNotification(title, body) {
    // Store notification (will implement push later)
    console.log("Broadcast:", title, body);
    return true;
}

// Export to global (use different name to avoid conflict)
window.SupabaseAPI = {
    client: _supabase,
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
