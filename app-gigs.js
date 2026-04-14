// ========================================
// GigsCourt - Gigs Module
// Register Gig, Submit Review, Cancel Gig, Real-time Listeners
// ========================================

import { 
    collection, 
    query, 
    where, 
    getDocs, 
    doc, 
    updateDoc, 
    addDoc, 
    onSnapshot, 
    limit
} from 'https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js';

// ========== GIG STATUS LISTENER STATE ==========
let gigStatusListener = null;
let currentListenerChatId = null;

// ========== HELPER: GET PROVIDER PROFILE FROM SUPABASE ==========
// This stays here temporarily until profiles move to Firestore
async function getSingleProfileFromSupabase(userId) {
    try {
        const supabase = window.supabase;
        if (!supabase) {
            console.warn('Supabase not available');
            return null;
        }
        
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

// ========== ROLLING 30-DAY GIG COUNT ==========
async function getRolling30DayGigCount(userId) {
    if (!userId) return 0;
    
    try {
        const supabase = window.supabase;
        if (!supabase) return 0;
        
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

// ========== CHECK PENDING REVIEW ==========
async function checkPendingReview(chatId, userId) {
    try {
        const supabase = window.supabase;
        if (!supabase) return;
        
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

// ========== CHECK AND SHOW REVIEW BUTTON ==========
async function checkAndShowReviewButton(chatId, userId) {
    try {
        const supabase = window.supabase;
        if (!supabase) return;
        
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

// ========== REGISTER GIG ==========
async function registerGig(chatId, clientId) {
    console.log('🚀 registerGig called with chatId:', chatId, 'clientId:', clientId);
    
    window.showToast('Registering gig...');
    window.haptic('light');
    
    const registerBtn = document.getElementById('register-gig-chat');
    const originalText = registerBtn?.textContent;
    if (registerBtn) {
        registerBtn.disabled = true;
        registerBtn.textContent = '⏳ Registering...';
        registerBtn.style.opacity = '0.7';
    }
    
    try {
        const providerId = window.auth.currentUser.uid;
        console.log('Provider ID:', providerId);
        
        const supabase = window.supabase;
        if (!supabase) {
            throw new Error('Supabase not available');
        }
        
        const { data: registerResult, error: registerError } = await supabase.rpc('register_gig', {
            p_provider_id: providerId,
            p_client_id: clientId,
            p_chat_id: chatId
        });
        
        if (registerError) {
            console.error('Supabase register_gig error:', registerError);
            throw new Error(registerError.message || 'Database error');
        }
        
        if (!registerResult || !registerResult.success) {
            throw new Error(registerResult?.message || 'Failed to register gig');
        }
        
        console.log('✅ Supabase gig registered. Credits remaining:', registerResult.credits_remaining);
        
        if (window.currentUserData) {
            window.currentUserData.credits = registerResult.credits_remaining;
        }
        
        const gigsRef = collection(window.db, 'chats', chatId, 'gigs');
        const gigDoc = await addDoc(gigsRef, {
            providerId: providerId,
            clientId: clientId,
            status: 'pending_review',
            registeredAt: new Date().toISOString(),
            completedAt: null,
            cancelledAt: null,
            cancelledBy: null,
            review: null
        });
        
        console.log('✅ Firestore gig created:', gigDoc.id);
        
        const chatRef = doc(window.db, 'chats', chatId);
        await updateDoc(chatRef, { 
            pendingReview: true,
            pendingGigId: gigDoc.id
        });
        
        const providerToast = document.getElementById('pending-review-toast-provider');
        const clientName = await getSingleProfileFromSupabase(clientId);
        const clientDisplayName = clientName?.displayName || 'Client';
        
        if (providerToast) {
            providerToast.textContent = `⏳ Waiting for ${clientDisplayName} to review this gig`;
            providerToast.style.display = 'block';
        }
        
        if (registerBtn) {
            registerBtn.disabled = true;
            registerBtn.style.opacity = '0.5';
            registerBtn.style.cursor = 'not-allowed';
            registerBtn.textContent = '⏳ Pending Review';
        }
        
        const reviewBtn = document.getElementById('submit-review-chat');
        const cancelBtn = document.getElementById('cancel-gig-chat');
        if (reviewBtn) reviewBtn.style.display = 'none';
        if (cancelBtn) cancelBtn.style.display = 'none';
        
        window.addNotification('Gig Registered', `${clientDisplayName} has been notified to review you`);
        
        const providerName = window.currentUserData?.displayName || 'Provider';
        window.addNotification(
            'New Gig Registration',
            `📋 ${providerName} registered a gig with you. Please review within 7 days.`,
            `/chat/${chatId}`
        );
        
        if (typeof window.sendPushNotification === 'function') {
            window.sendPushNotification(
                clientId,
                'New Gig Request',
                `${providerName} registered a gig with you. Please review within 7 days.`,
                `/chat/${chatId}`
            ).catch(err => console.warn('Push notification failed:', err));
        }
        
        window.showToast('✅ Gig registered! Client will review within 7 days.', 'success');
        window.haptic('heavy');
        
    } catch (error) {
        console.error('❌ registerGig error:', error);
        window.showToast(error.message || 'Error registering gig', 'error');
        
        if (registerBtn) {
            registerBtn.disabled = false;
            registerBtn.textContent = originalText || '📋 Register Gig with this person';
            registerBtn.style.opacity = '1';
            registerBtn.style.cursor = 'pointer';
        }
    }
}

// ========== SUBMIT REVIEW ==========
async function submitReview(providerId, clientId, rating, reviewText) {
    window.showToast('Submitting review...');
    window.haptic('light');
    
    try {
        const gigsRef = collection(window.db, 'chats', window.currentChatId, 'gigs');
        const q = query(
            gigsRef,
            where('status', '==', 'pending_review'),
            where('providerId', '==', providerId),
            where('clientId', '==', clientId),
            limit(1)
        );
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            throw new Error('No pending gig found to review');
        }
        
        const gigDoc = snapshot.docs[0];
        const gigRef = doc(window.db, 'chats', window.currentChatId, 'gigs', gigDoc.id);
        
        await updateDoc(gigRef, {
            status: 'completed',
            completedAt: new Date().toISOString(),
            review: {
                rating: rating,
                comment: reviewText || '',
                submittedAt: new Date().toISOString()
            }
        });
        
        console.log('✅ Firestore gig updated to completed:', gigDoc.id);
        
        const chatRef = doc(window.db, 'chats', window.currentChatId);
        await updateDoc(chatRef, { pendingReview: false });
        
        const supabase = window.supabase;
        if (supabase) {
            const { data, error } = await supabase.rpc('submit_review_backend', {
                p_provider_id: providerId,
                p_client_id: clientId,
                p_rating: rating,
                p_review_text: reviewText,
                p_gig_id: gigDoc.id
            });
            
            if (error) {
                console.warn('Supabase backend error:', error);
            }
            
            if (data && data.credit_alert) {
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
                }
            }
            
            if (data && data.milestone) {
                let milestoneMessage = '';
                if (data.milestone === 1) milestoneMessage = '🎉 Congrats on your first gig! Keep going!';
                else if (data.milestone === 5) milestoneMessage = '🌟 5 gigs completed! You\'re on fire!';
                else if (data.milestone === 10) milestoneMessage = '🏆 10 gigs! You\'re a GigsCourt pro!';
                else if (data.milestone === 25) milestoneMessage = '👑 25 gigs! You\'re one of our top providers!';
                else if (data.milestone === 50) milestoneMessage = '💎 50 gigs! Legendary status!';
                
                if (milestoneMessage) {
                    window.addNotification('🎉 Milestone Achieved!', milestoneMessage);
                }
            }
        }
        
        const clientName = window.currentUserData?.displayName || 'Client';
        window.addNotification(
            'New Review',
            `⭐ ${clientName} reviewed and rated you ${rating} stars. 1 credit has been deducted.`
        );
        
        window.showToast(`✅ Review submitted! ${rating} stars. Thank you!`, 'success');
        window.haptic('heavy');
        
    } catch (error) {
        console.error('submitReview error:', error);
        window.showToast(error.message || 'Error submitting review', 'error');
        throw error;
    }
}

// ========== CANCEL GIG ==========
async function cancelGig(chatId, providerId) {
    try {
        const confirmed = confirm('⚠️ Cancel Gig Request\n\nAre you sure you want to cancel this gig?\n\n• The provider will be notified\n\n[OK] to Cancel  [Cancel] to Go Back');
        
        if (!confirmed) return;
        
        const currentUser = window.auth.currentUser.uid;
        
        const gigsRef = collection(window.db, 'chats', chatId, 'gigs');
        const q = query(
            gigsRef,
            where('status', '==', 'pending_review'),
            where('clientId', '==', currentUser),
            where('providerId', '==', providerId),
            limit(1)
        );
        
        const snapshot = await getDocs(q);
        
        if (snapshot.empty) {
            window.showToast('No pending gig found to cancel', 'error');
            return;
        }
        
        const gigDoc = snapshot.docs[0];
        const gigRef = doc(window.db, 'chats', chatId, 'gigs', gigDoc.id);
        
        await updateDoc(gigRef, {
            status: 'cancelled',
            cancelledAt: new Date().toISOString(),
            cancelledBy: currentUser
        });
        
        console.log('✅ Firestore gig cancelled:', gigDoc.id);
        
        const chatRef = doc(window.db, 'chats', chatId);
        await updateDoc(chatRef, { pendingReview: false });
        
        const supabase = window.supabase;
        if (supabase) {
            supabase.rpc('cancel_gig_backend', {
                p_gig_id: gigDoc.id,
                p_cancelled_by: currentUser
            }).catch(err => console.warn('Supabase cancel error:', err));
        }
        
        window.addNotification('Gig Cancelled', 'Client cancelled the gig request. No credits were deducted.');
        
        window.showToast('✅ Gig cancelled successfully', 'success');
        
    } catch (error) {
        console.error('cancelGig error:', error);
        window.showToast('Error cancelling gig', 'error');
    }
}

// ========== CHECK GIG STATUS AND UPDATE UI ==========
async function checkGigStatusAndUpdateUI(chatId, userId) {
    console.log('🔍 checkGigStatusAndUpdateUI called for chat:', chatId);
    
    try {
        const currentUser = window.auth.currentUser.uid;
        
        if (gigStatusListener && currentListenerChatId !== chatId) {
            gigStatusListener();
            gigStatusListener = null;
            console.log('🧹 Cleaned up Firestore gig listener for different chat');
        }
        
        const updateUI = async (gigData) => {
            console.log('🎨 updateUI called with gigData:', gigData);
            
            const registerBtn = document.getElementById('register-gig-chat');
            const reviewBtn = document.getElementById('submit-review-chat');
            const cancelBtn = document.getElementById('cancel-gig-chat');
            const providerToast = document.getElementById('pending-review-toast-provider');
            const clientToast = document.getElementById('pending-review-toast-client');
            
            const otherUser = await getSingleProfileFromSupabase(userId);
            const otherUserName = otherUser?.displayName || 'User';
            
            if (!gigData) {
                console.log('No pending gig found');
                if (registerBtn) {
                    registerBtn.disabled = false;
                    registerBtn.style.opacity = '1';
                    registerBtn.style.cursor = 'pointer';
                    registerBtn.textContent = '📋 Register Gig with this person';
                }
                if (providerToast) providerToast.style.display = 'none';
                if (clientToast) clientToast.style.display = 'none';
                if (reviewBtn) reviewBtn.style.display = 'none';
                if (cancelBtn) cancelBtn.style.display = 'none';
                return;
            }
            
            const isProvider = gigData.providerId === currentUser;
            const isClient = gigData.clientId === currentUser;
            const isPending = gigData.status === 'pending_review';
            
            console.log('Gig status - isProvider:', isProvider, 'isClient:', isClient, 'isPending:', isPending);
            
            if (isProvider && isPending) {
                console.log('✅ Provider view - showing waiting toast');
                if (registerBtn) {
                    registerBtn.disabled = true;
                    registerBtn.style.opacity = '0.5';
                    registerBtn.style.cursor = 'not-allowed';
                    registerBtn.textContent = '⏳ Pending Review';
                }
                if (providerToast) {
                    providerToast.textContent = `⏳ Waiting for ${otherUserName} to review this gig`;
                    providerToast.style.display = 'block';
                }
                if (reviewBtn) reviewBtn.style.display = 'none';
                if (cancelBtn) cancelBtn.style.display = 'none';
            } 
            else if (isClient && isPending) {
                console.log('✅ Client view - showing review button');
                if (registerBtn) {
                    registerBtn.disabled = true;
                    registerBtn.style.opacity = '0.5';
                    registerBtn.style.cursor = 'not-allowed';
                    registerBtn.textContent = '⏳ Pending Review';
                }
                if (clientToast) {
                    clientToast.textContent = `⭐ You have a pending review for ${otherUserName}`;
                    clientToast.style.display = 'block';
                }
                if (reviewBtn) reviewBtn.style.display = 'block';
                if (cancelBtn) cancelBtn.style.display = 'block';
            }
            else {
                console.log('Gig exists but not pending - resetting UI');
                if (registerBtn) {
                    registerBtn.disabled = false;
                    registerBtn.style.opacity = '1';
                    registerBtn.style.cursor = 'pointer';
                    registerBtn.textContent = '📋 Register Gig with this person';
                }
                if (providerToast) providerToast.style.display = 'none';
                if (clientToast) clientToast.style.display = 'none';
                if (reviewBtn) reviewBtn.style.display = 'none';
                if (cancelBtn) cancelBtn.style.display = 'none';
            }
        };
        
        const gigsRef = collection(window.db, 'chats', chatId, 'gigs');
        const q = query(
            gigsRef,
            where('status', '==', 'pending_review'),
            limit(1)
        );
        
        const initialSnapshot = await getDocs(q);
        console.log('📊 Initial query - pending gigs found:', initialSnapshot.size);
        
        if (!initialSnapshot.empty) {
            const gigDoc = initialSnapshot.docs[0];
            const gigData = gigDoc.data();
            gigData.id = gigDoc.id;
            await updateUI(gigData);
        } else {
            await updateUI(null);
        }
        
        if (!gigStatusListener || currentListenerChatId !== chatId) {
            currentListenerChatId = chatId;
            window.currentListenerChatId = chatId;
            
            gigStatusListener = onSnapshot(q, async (snapshot) => {
                console.log('🔔 Firestore gig update detected. Docs:', snapshot.size);
                
                if (snapshot.empty) {
                    await updateUI(null);
                    return;
                }
                
                const gigDoc = snapshot.docs[0];
                const gigData = gigDoc.data();
                gigData.id = gigDoc.id;
                
                console.log('📊 Firestore gig:', gigData.status, 'Provider:', gigData.providerId, 'Client:', gigData.clientId);
                
                await updateUI(gigData);
                
                if (gigData.status !== 'pending_review') {
                    console.log('✅ Gig review completed, UI updated in real-time');
                }
            }, (error) => {
                console.error('❌ Firestore gig listener error:', error);
            });
            
            window.gigStatusListener = gigStatusListener;
            
            console.log(`✅ Firestore gig listener started for chat ${chatId}`);
        }
        
    } catch (error) {
        console.error('❌ checkGigStatusAndUpdateUI error:', error);
    }
}

// ========== SHOW REVIEW BOTTOM SHEET ==========
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
        
        const submitBtn = document.getElementById('submit-review-btn');
        if (submitBtn) {
            const newSubmitBtn = submitBtn.cloneNode(true);
            submitBtn.parentNode.replaceChild(newSubmitBtn, submitBtn);
            
            newSubmitBtn.addEventListener('click', async () => {
                if (selectedRating === 0) {
                    window.showToast('Please select a rating', 'error');
                    return;
                }
                
                newSubmitBtn.disabled = true;
                newSubmitBtn.textContent = '⏳ Submitting...';
                
                const comment = document.getElementById('review-comment')?.value || '';
                window.closeBottomSheet();
                
                try {
                    await submitReview(providerId, window.auth.currentUser.uid, selectedRating, comment);
                    window.closeBottomSheet();
                    if (typeof window.openChat === 'function') {
                        window.openChat(providerId, chatId);
                    }
                } catch (error) {
                    newSubmitBtn.disabled = false;
                    newSubmitBtn.textContent = 'Submit Review';
                }
            });
        }
    } catch (error) {
        console.error('showReviewBottomSheet error:', error);
        window.showToast('Error loading review screen', 'error');
    }
}

// ========== SHOW REVIEWS ==========
async function showReviews(providerId) {
    try {
        const supabase = window.supabase;
        if (!supabase) {
            window.showToast('Error loading reviews', 'error');
            return;
        }
        
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

// ========== SHOW RECENT CHATS FOR GIG ==========
async function showRecentChatsForGig() {
    window.openBottomSheet(`
        <h3 style="margin-bottom: 16px;">Select a client you worked with</h3>
        <div id="recent-chats-container" style="max-height: 400px; overflow-y: auto;">
            <div class="loading-spinner"></div>
        </div>
    `);
    
    window.haptic('light');
    
    (async () => {
        try {
            const chatsRef = collection(window.db, 'chats');
            const q = query(
                chatsRef,
                where('participants', 'array-contains', window.auth.currentUser.uid),
                where('lastMessageTime', '>=', new Date(Date.now() - 14 * 24 * 60 * 60 * 1000).toISOString())
            );
            const chatsSnapshot = await getDocs(q);
            
            const container = document.getElementById('recent-chats-container');
            if (!container) return;
            
            if (chatsSnapshot.empty) {
                container.innerHTML = '<div class="empty-state">No recent chats found</div>';
                return;
            }
            
            const recentUsers = [];
            const userIds = [...new Set(
                chatsSnapshot.docs.map(doc => {
                    const chat = doc.data();
                    return chat.participants.find(p => p !== window.auth.currentUser.uid);
                })
            )];
            
            const supabase = window.supabase;
            const profilesMap = {};
            
            if (supabase) {
                const { data: profiles } = await supabase.rpc('get_chat_users', {
                    p_user_ids: userIds
                });
                
                if (profiles) {
                    profiles.forEach(p => { profilesMap[p.user_id] = p; });
                }
            }
            
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
            
            if (recentUsers.length === 0) {
                container.innerHTML = '<div class="empty-state">No recent chats found</div>';
                return;
            }
            
            container.innerHTML = recentUsers.map(u => `
                <button class="recent-client-btn" data-user-id="${u.id}" data-chat-id="${u.chatId}" style="width: 100%; padding: 16px; margin-bottom: 8px; background: var(--bg-secondary); border: none; border-radius: 12px; text-align: left;">
                    ${u.displayName || 'User'} - ${u.services ? u.services.split(',')[0] : ''}
                </button>
            `).join('');
            
            document.querySelectorAll('.recent-client-btn').forEach(btn => {
                btn.addEventListener('click', () => {
                    window.closeBottomSheet();
                    registerGig(btn.dataset.chatId, btn.dataset.userId);
                });
            });
            
        } catch (error) {
            console.error('showRecentChatsForGig error:', error);
            const container = document.getElementById('recent-chats-container');
            if (container) {
                container.innerHTML = '<div class="empty-state">Error loading chats</div>';
            }
            window.showToast('Error loading recent chats', 'error');
        }
    })();
}

// ========== EXPOSE TO WINDOW ==========
window.registerGig = registerGig;
window.submitReview = submitReview;
window.cancelGig = cancelGig;
window.checkGigStatusAndUpdateUI = checkGigStatusAndUpdateUI;
window.checkPendingReview = checkPendingReview;
window.checkAndShowReviewButton = checkAndShowReviewButton;
window.showReviewBottomSheet = showReviewBottomSheet;
window.showReviews = showReviews;
window.showRecentChatsForGig = showRecentChatsForGig;
window.getRolling30DayGigCount = getRolling30DayGigCount;
