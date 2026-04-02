// ========================================
// GigsCourt Supabase Connection
// Database + Geohash + Realtime + Auth
// ========================================

// 🔴 REPLACE THESE WITH YOUR ACTUAL SUPABASE KEYS 🔴
// Go to: Supabase Dashboard → Project Settings → API
const SUPABASE_URL = "https://qifzdrkpxzosdturjpex.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_QfKJ4jT8u_2HuUKmW-xvbQ_9acJvZw-";
// 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴

// Initialize Supabase client
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

// ===== Geohash Functions (6-character for cost optimization) =====
function encodeGeohash(lat, lng, precision = 6) {
    // Base32 characters
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

function decodeGeohash(geohash) {
    const BASE32 = "0123456789bcdefghjkmnpqrstuvwxyz";
    let latMin = -90, latMax = 90;
    let lngMin = -180, lngMax = 180;
    let isEven = true;
    
    for (let i = 0; i < geohash.length; i++) {
        const char = geohash[i];
        const bits = BASE32.indexOf(char);
        
        for (let bit = 4; bit >= 0; bit--) {
            const mask = 1 << bit;
            if (isEven) {
                if (bits & mask) {
                    lngMin = (lngMin + lngMax) / 2;
                } else {
                    lngMax = (lngMin + lngMax) / 2;
                }
            } else {
                if (bits & mask) {
                    latMin = (latMin + latMax) / 2;
                } else {
                    latMax = (latMin + latMax) / 2;
                }
            }
            isEven = !isEven;
        }
    }
    return {
    latitude: (latMin + latMax) / 2,
        longitude: (lngMin + lngMax) / 2
    };
}

// ===== Nearby Query using Geohash Prefix (Cost Optimized) =====
async function getNearbyProfiles(centerLat, centerLng, radiusKm = 10) {
    const centerGeohash = encodeGeohash(centerLat, centerLng, 6);
    // Use prefix matching for nearby search (saves 90% CPU vs PostGIS math)
    const geohashPrefix = centerGeohash.substring(0, 4);
    
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .like('geohash', `${geohashPrefix}%`)
        .limit(50);
    
    if (error) throw error;
    
    // Optional: Filter by exact distance client-side for precision
    return data;
}

// ===== Authentication Functions =====
async function signUp(email, password, userData) {
    const { data, error } = await supabase.auth.signUp({
        email,
        password,
        options: {
            data: userData
        }
    });
    if (error) throw error;
    
    // Create profile record
    if (data.user) {
        const { error: profileError } = await supabase
            .from('profiles')
            .insert({
                id: data.user.id,
                username: userData.username,
                full_name: userData.full_name,
                credits: 6 // 6 free credits for new users
            });
        if (profileError) console.error("Profile creation error:", profileError);
    }
    return data;
}

async function signIn(email, password) {
    const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password
    });
    if (error) throw error;
    return data;
}

async function signOut() {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
}

async function getCurrentUser() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) return null;
    if (!user) return null;
    
    // Get full profile
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', user.id)
        .single();
    
    if (profileError) return { user, profile: null };
    return { user, profile };
}

// ===== Profile Functions =====
async function getProfile(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', userId)
        .single();
    if (error) throw error;
    return data;
}

async function updateProfile(userId, updates) {
    const { data, error } = await supabase
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
    const { error } = await supabase
        .from('profiles')
        .update({ geohash })
        .eq('id', userId);
    if (error) throw error;
    return geohash;
}

// ===== Gigs/Portfolio Functions =====
async function getGigs(filters = {}, page = 0, limit = 10) {
    let query = supabase
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
    const { data, error } = await supabase
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

// ===== Messages Functions =====
async function getConversations(userId) {
    const { data, error } = await supabase
        .from('messages')
        .select('*, sender:profiles!sender_id(*), receiver:profiles!receiver_id(*)')
        .or(`sender_id.eq.${userId},receiver_id.eq.${userId}`)
        .order('created_at', { ascending: false });
    if (error) throw error;
    
    // Group by conversation partner
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
    const messageData = {
        sender_id: senderId,
        receiver_id: receiverId
    };
    
    if (type === 'text') messageData.content = content;
    if (type === 'image') messageData.image_url = content;
    if (type === 'voice') messageData.voice_note_url = content;
    
    const { data, error } = await supabase
        .from('messages')
        .insert(messageData)
        .select()
        .single();
    if (error) throw error;
    return data;
}

// ===== Realtime Subscription =====
function subscribeToMessages(userId, onMessage) {
    const subscription = supabase
        .channel('messages')
        .on('postgres_changes', {
            event: 'INSERT',
            schema: 'public',
            table: 'messages',
            filter: `receiver_id=eq.${userId}`
        }, (payload) => {
            onMessage(payload.new);
        })
        .subscribe();
    return subscription;
}

// ===== Ratings Functions =====
async function submitRating(fromUserId, toUserId, gigId, rating, review) {
    const { data, error } = await supabase
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
    
    // Trigger confetti on success
    if (window.canvasConfetti) {
        window.canvasConfetti({
            particleCount: 150,
            spread: 70,
            origin: { y: 0.6 },
            colors: ['#d35400', '#e03a3a', '#f5f5f0']
        });
    }
    return data;
}

async function getUserRatings(userId) {
    const { data, error } = await supabase
        .from('ratings')
        .select('*, from:profiles!from_user_id(*)')
        .eq('to_user_id', userId)
        .order('created_at', { ascending: false });
    if (error) throw error;
    
    const average = data.reduce((sum, r) => sum + r.rating, 0) / (data.length || 1);
    return { ratings: data, average };
}

// ===== Wallet/Credits Functions =====
async function getCredits(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', userId)
        .single();
    if (error) throw error;
    return data.credits;
}

async function deductCredit(userId) {
    const { data, error } = await supabase
        .rpc('deduct_credit', { user_id: userId });
    if (error) throw error;
    return data;
}

async function addCredits(userId, amount, description) {
    // First update profile
    const { data: profile, error: profileError } = await supabase
        .from('profiles')
        .select('credits')
        .eq('id', userId)
        .single();
    if (profileError) throw profileError;
    
    const { error: updateError } = await supabase
        .from('profiles')
        .update({ credits: profile.credits + amount })
        .eq('id', userId);
    if (updateError) throw updateError;
    
    // Log transaction
    const { error: txError } = await supabase
        .from('transactions')
        .insert({
            user_id: userId,
            amount: amount,
            type: 'credit',
            description: description
        });
    if (txError) console.error("Transaction log error:", txError);
    
    return profile.credits + amount;
}

// ===== Voice Note Cleanup (14 days - called by cron) =====
async function deleteOldVoiceNotes() {
    const fourteenDaysAgo = new Date();
    fourteenDaysAgo.setDate(fourteenDaysAgo.getDate() - 14);
    
    const { data, error } = await supabase
        .from('voice_notes')
        .delete()
        .lt('created_at', fourteenDaysAgo.toISOString())
        .select('file_url');
    
    if (error) throw error;
    
    // Delete from storage as well
    for (const note of data) {
        const fileName = note.file_url.split('/').pop();
        await supabase.storage.from('voice_notes').remove([fileName]);
    }
    return data.length;
}

// ===== Admin Functions =====
async function checkIsAdmin(userId) {
    const { data, error } = await supabase
        .from('profiles')
        .select('is_admin')
        .eq('id', userId)
        .single();
    if (error) return false;
    return data.is_admin === true;
}

async function getDisputeMessages(userId1, userId2) {
    const { data, error } = await supabase
        .from('messages')
        .select('*')
        .or(`and(sender_id.eq.${userId1},receiver_id.eq.${userId2}),and(sender_id.eq.${userId2},receiver_id.eq.${userId1})`)
        .order('created_at', { ascending: true });
    if (error) throw error;
    return data;
}

// ===== Broadcast Notification (Admin only) =====
async function broadcastNotification(title, body, targetUserIds = null) {
    // Store in notifications table (create if needed)
    const { error } = await supabase
        .from('notifications')
        .insert({
            title,
            body,
            target_users: targetUserIds,
            created_at: new Date()
        });
    if (error) throw error;
    return true;
}

// Export to global
window.Supabase = {
    client: supabase,
    encodeGeohash,
    decodeGeohash,
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
    addCredits,
    deleteOldVoiceNotes,
    checkIsAdmin,
    getDisputeMessages,
    broadcastNotification
};
