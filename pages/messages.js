// ========================================
// GigsCourt Messages Page
// Real-time Chat + Voice Notes + Images
// ========================================

const MessagesPage = (function() {
    
    let currentConversations = [];
    let currentChatUser = null;
    let currentMessages = [];
    let messageSubscription = null;
    let mediaRecorder = null;
    let audioChunks = [];
    let isRecording = false;
    
    // ===== Render Main Messages Page =====
    function render() {
        const container = document.getElementById("page-content");
        if (!container) return "";
        
        const html = `
            <div class="messages-container" style="height: 100vh; display: flex; flex-direction: column;">
                <div class="messages-header" style="
                    padding: 16px;
                    background: var(--bg-primary);
                    border-bottom: 1px solid var(--border-glass);
                    position: sticky;
                    top: 0;
                    z-index: 10;
                ">
                    <h2 style="font-size: 24px; font-weight: 600;">Messages</h2>
                </div>
                
                <div id="conversations-list" style="flex: 1; overflow-y: auto; padding: 8px 0;">
                    <div class="loading">Loading conversations...</div>
                </div>
            </div>
        `;
        
        container.innerHTML = html;
        
        loadConversations();
        
        return html;
    }
    
    // ===== Load All Conversations =====
    async function loadConversations() {
        const container = document.getElementById("conversations-list");
        if (!container) return;
        
        try {
            const currentUser = await window.Supabase.getCurrentUser();
            if (!currentUser) {
                container.innerHTML = `<div class="loading">Please log in to view messages</div>`;
                return;
            }
            
            const conversations = await window.Supabase.getConversations(currentUser.user.id);
            currentConversations = conversations;
            
            if (conversations.length === 0) {
                container.innerHTML = `<div class="loading">No messages yet. Start a conversation from a profile!</div>`;
                return;
            }
            
            renderConversations(conversations);
            
        } catch (error) {
            console.error("Error loading conversations:", error);
            container.innerHTML = `<div class="loading">Error loading messages. Pull to refresh.</div>`;
        }
    }
    
    // ===== Render Conversations List =====
    function renderConversations(conversations) {
        const container = document.getElementById("conversations-list");
        if (!container) return;
        
        container.innerHTML = "";
        
        conversations.forEach(conv => {
            const item = document.createElement("div");
            item.className = "conversation-item";
            item.style.cssText = `
                display: flex;
                align-items: center;
                gap: 12px;
                padding: 16px;
                cursor: pointer;
                transition: background 0.2s ease;
                border-bottom: 1px solid var(--border-glass);
            `;
            
            // Avatar placeholder
            const avatarUrl = conv.partner?.avatar_url || "";
            const initial = conv.partner?.full_name?.charAt(0) || conv.partner?.username?.charAt(0) || "?";
            
            item.innerHTML = `
                <div style="
                    width: 50px;
                    height: 50px;
                    border-radius: 50%;
                    background: var(--accent-burnt-orange);
                    display: flex;
                    align-items: center;
                    justify-content: center;
                    font-size: 20px;
                    font-weight: 600;
                    color: white;
                ">${initial}</div>
                
                <div style="flex: 1;">
                    <div style="display: flex; justify-content: space-between; align-items: baseline;">
                        <strong style="font-size: 16px;">${escapeHtml(conv.partner?.full_name || conv.partner?.username || "User")}</strong>
                        <span style="font-size: 11px; color: var(--text-secondary);">${formatTime(conv.lastMessageTime)}</span>
                    </div>
                    <div style="display: flex; justify-content: space-between; align-items: center; margin-top: 4px;">
                        <span style="font-size: 13px; color: var(--text-secondary); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; max-width: 200px;">
                            ${conv.lastMessage || "Tap to chat"}
                        </span>
                        ${conv.unread ? `<span style="background: var(--accent-modern-red); color: white; border-radius: 12px; padding: 2px 8px; font-size: 10px;">New</span>` : ""}
                    </div>
                </div>
            `;
            
            item.addEventListener("click", () => openChat(conv.partner));
            container.appendChild(item);
        });
    }
    
    // ===== Open Chat with User =====
    async function openChat(user) {
        currentChatUser = user;
        currentMessages = [];
        
        const container = document.getElementById("page-content");
        if (!container) return;
        
        const currentUser = await window.Supabase.getCurrentUser();
        if (!currentUser) return;
        
        // Subscribe to real-time messages
        if (messageSubscription) {
            await messageSubscription.unsubscribe();
        }
        
        messageSubscription = window.Supabase.subscribeToMessages(
            currentUser.user.id,
            (newMessage) => {
                if (newMessage.sender_id === currentChatUser.id || newMessage.receiver_id === currentChatUser.id) {
                    currentMessages.push(newMessage);
                    renderChatMessages();
                }
            }
        );
        
        // Load existing messages
        await loadChatHistory(currentUser.user.id, currentChatUser.id);
        
        // Render chat UI
        container.innerHTML = `
            <div class="chat-container" style="height: 100vh; display: flex; flex-direction: column; background: var(--bg-primary);">
                <div class="chat-header" style="
                    padding: 16px;
                    background: var(--bg-glass);
                    backdrop-filter: blur(20px);
                    display: flex;
                    align-items: center;
                    gap: 12px;
                    position: sticky;
                    top: 0;
                    z-index: 10;
                ">
                    <i class="fas fa-arrow-left" style="font-size: 20px; cursor: pointer;" id="chat-back-btn"></i>
                    <div style="width: 40px; height: 40px; border-radius: 50%; background: var(--accent-burnt-orange); display: flex; align-items: center; justify-content: center; color: white; font-weight: 600;">
                        ${(currentChatUser.full_name || currentChatUser.username || "U").charAt(0)}
                    </div>
                    <div style="flex: 1;">
                        <strong>${escapeHtml(currentChatUser.full_name || currentChatUser.username)}</strong>
                        <div style="font-size: 12px; color: var(--text-secondary);">Online</div>
                    </div>
                    <i class="fas fa-phone" style="font-size: 20px; cursor: pointer; color: var(--accent-modern-red);" id="call-btn"></i>
                </div>
                
                <div id="chat-messages" style="flex: 1; overflow-y: auto; padding: 16px; display: flex; flex-direction: column; gap: 12px;">
                    <div class="loading">Loading messages...</div>
                </div>
                
                <div class="chat-input-container" style="
                    padding: 12px;
                    background: var(--bg-glass);
                    backdrop-filter: blur(20px);
                    display: flex;
                    gap: 8px;
                    align-items: center;
                    border-top: 1px solid var(--border-glass);
                ">
                    <i class="fas fa-microphone" id="voice-record-btn" style="font-size: 22px; color: var(--accent-modern-red); cursor: pointer;"></i>
                    <i class="fas fa-image" id="image-upload-btn" style="font-size: 22px; color: var(--text-secondary); cursor: pointer;"></i>
                    <input type="text" id="message-input" placeholder="Type a message..." style="
                        flex: 1;
                        padding: 12px;
                        border: none;
                        border-radius: 24px;
                        background: var(--bg-primary);
                        color: var(--text-primary);
                        outline: none;
                    ">
                    <i class="fas fa-paper-plane" id="send-btn" style="font-size: 22px; color: var(--accent-burnt-orange); cursor: pointer;"></i>
                </div>
            </div>
        `;
        
        // Setup chat event listeners
        document.getElementById("chat-back-btn")?.addEventListener("click", () => {
            if (window.Navigation) {
                window.Navigation.goBack();
            } else {
                render();
            }
        });
        
        document.getElementById("call-btn")?.addEventListener("click", () => {
            if (currentChatUser.phone) {
                window.location.href = `tel:${currentChatUser.phone}`;
            } else {
                window.Modal?.showAlert("Call", "User hasn't shared phone number");
            }
        });
        
        document.getElementById("send-btn")?.addEventListener("click", () => sendMessage());
        document.getElementById("message-input")?.addEventListener("keypress", (e) => {
            if (e.key === "Enter") sendMessage();
        });
        
        document.getElementById("voice-record-btn")?.addEventListener("click", toggleVoiceRecording);
        document.getElementById("image-upload-btn")?.addEventListener("click", uploadImage);
        
        renderChatMessages();
    }
    
    // ===== Load Chat History =====
    async function loadChatHistory(userId, partnerId) {
        try {
            const { data, error } = await window.Supabase.client
                .from("messages")
                .select("*")
                .or(`and(sender_id.eq.${userId},receiver_id.eq.${partnerId}),and(sender_id.eq.${partnerId},receiver_id.eq.${userId})`)
                .order("created_at", { ascending: true });
            
            if (error) throw error;
            currentMessages = data || [];
            
        } catch (error) {
            console.error("Error loading chat history:", error);
        }
    }
    
    // ===== Render Chat Messages =====
    function renderChatMessages() {
        const container = document.getElementById("chat-messages");
        if (!container) return;
        
        if (currentMessages.length === 0) {
            container.innerHTML = `<div style="text-align: center; color: var(--text-secondary);">No messages yet. Say hello!</div>`;
            return;
        }
        
        container.innerHTML = "";
        
        currentMessages.forEach(async (msg) => {
            const isSender = msg.sender_id === (await window.Supabase.getCurrentUser())?.user?.id;
            const messageDiv = document.createElement("div");
            messageDiv.style.cssText = `
                display: flex;
                justify-content: ${isSender ? "flex-end" : "flex-start"};
            `;
            
            let content = "";
            if (msg.content) {
                content = `<div style="background: ${isSender ? "var(--accent-burnt-orange)" : "var(--bg-secondary)"}; color: ${isSender ? "white" : "var(--text-primary)"}; padding: 10px 14px; border-radius: 20px; max-width: 70%; word-wrap: break-word;">${escapeHtml(msg.content)}</div>`;
            } else if (msg.image_url) {
                content = `<img src="${msg.image_url}" style="max-width: 200px; border-radius: 16px; cursor: pointer;" onclick="window.open('${msg.image_url}')">`;
            } else if (msg.voice_note_url) {
                content = `<audio controls src="${msg.voice_note_url}" style="max-width: 200px;"></audio>`;
            }
            
            messageDiv.innerHTML = `
                <div style="max-width: 70%;">
                    ${content}
                    <div style="font-size: 10px; color: var(--text-secondary); margin-top: 4px; text-align: ${isSender ? "right" : "left"}">
                        ${new Date(msg.created_at).toLocaleTimeString([], {hour: "2-digit", minute:"2-digit"})}
                    </div>
                </div>
            `;
            container.appendChild(messageDiv);
        });
        
        // Scroll to bottom
        container.scrollTop = container.scrollHeight;
    }
    
    // ===== Send Text Message =====
    async function sendMessage() {
        const input = document.getElementById("message-input");
        const content = input?.value.trim();
        if (!content) return;
        
        const currentUser = await window.Supabase.getCurrentUser();
        if (!currentUser) {
            window.Modal?.showAlert("Login Required", "Please log in to send messages");
            return;
        }
        
        // Check credits
        const canDo = await window.Paystack?.canPerformAction(currentUser.user.id, "message");
        if (!canDo?.allowed) {
            window.Modal?.showAlert("Insufficient Credits", `You need 1 credit to send a message. You have ${canDo?.credits || 0} credits.`);
            return;
        }
        
        try {
            await window.Supabase.sendMessage(currentUser.user.id, currentChatUser.id, content, "text");
            await window.Paystack.deductForAction(currentUser.user.id, "message");
            
            input.value = "";
            await loadChatHistory(currentUser.user.id, currentChatUser.id);
            renderChatMessages();
            
        } catch (error) {
            console.error("Error sending message:", error);
            window.Modal?.showAlert("Error", error.message);
        }
    }
    
    // ===== Toggle Voice Recording =====
    function toggleVoiceRecording() {
        if (isRecording) {
            stopRecording();
        } else {
            startRecording();
        }
    }
    
    async function startRecording() {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
            mediaRecorder = new MediaRecorder(stream);
            audioChunks = [];
            
            mediaRecorder.ondataavailable = (event) => {
                audioChunks.push(event.data);
            };
            
            mediaRecorder.onstop = () => sendVoiceNote();
            
            mediaRecorder.start();
            isRecording = true;
            
            const btn = document.getElementById("voice-record-btn");
            if (btn) {
                btn.style.color = "var(--accent-modern-red)";
                btn.style.textShadow = "0 0 8px var(--accent-modern-red-glow)";
            }
            
            // Auto-stop after 60 seconds
            setTimeout(() => {
                if (isRecording) stopRecording();
            }, 60000);
            
        } catch (error) {
            console.error("Microphone error:", error);
            window.Modal?.showAlert("Microphone", "Please allow microphone access to record voice notes");
        }
    }
    
    function stopRecording() {
        if (mediaRecorder && isRecording) {
            mediaRecorder.stop();
            mediaRecorder.stream.getTracks().forEach(track => track.stop());
            isRecording = false;
            
            const btn = document.getElementById("voice-record-btn");
            if (btn) {
                btn.style.color = "var(--accent-modern-red)";
                btn.style.textShadow = "none";
            }
        }
    }
    
    async function sendVoiceNote() {
        const audioBlob = new Blob(audioChunks, { type: "audio/webm" });
        const file = new File([audioBlob], `voice_${Date.now()}.webm`, { type: "audio/webm" });
        
        // Upload to Supabase Storage
        const currentUser = await window.Supabase.getCurrentUser();
        if (!currentUser) return;
        
        const fileName = `voice_notes/${currentUser.user.id}_${Date.now()}.ogg`;
        const { data, error } = await window.Supabase.client.storage
            .from("voice_notes")
            .upload(fileName, file);
        
        if (error) {
            console.error("Upload error:", error);
            return;
        }
        
        const { data: urlData } = window.Supabase.client.storage
            .from("voice_notes")
            .getPublicUrl(fileName);
        
        await window.Supabase.sendMessage(currentUser.user.id, currentChatUser.id, urlData.publicUrl, "voice");
        
        // Save to voice_notes table for 14-day cleanup
        await window.Supabase.client
            .from("voice_notes")
            .insert({ user_id: currentUser.user.id, file_url: urlData.publicUrl });
        
        await loadChatHistory(currentUser.user.id, currentChatUser.id);
        renderChatMessages();
    }
    
    // ===== Upload Image =====
    async function uploadImage() {
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "image/*";
        
        input.onchange = async (e) => {
            const file = e.target.files[0];
            if (!file) return;
            
            const currentUser = await window.Supabase.getCurrentUser();
            if (!currentUser) return;
            
            // Upload to ImageKit
            if (window.ImageKit) {
                const result = await window.ImageKit.uploadImage(file, "chat");
                await window.Supabase.sendMessage(currentUser.user.id, currentChatUser.id, result.url, "image");
            } else {
                // Fallback: upload to Supabase Storage
                const fileName = `chat_images/${currentUser.user.id}_${Date.now()}.jpg`;
                const { error } = await window.Supabase.client.storage
                    .from("chat_images")
                    .upload(fileName, file);
                
                if (!error) {
                    const { data: urlData } = window.Supabase.client.storage
                        .from("chat_images")
                        .getPublicUrl(fileName);
                    await window.Supabase.sendMessage(currentUser.user.id, currentChatUser.id, urlData.publicUrl, "image");
                }
            }
            
            await loadChatHistory(currentUser.user.id, currentChatUser.id);
            renderChatMessages();
        };
        
        input.click();
    }
    
    // ===== Helper Functions =====
    function escapeHtml(str) {
        if (!str) return "";
        return str.replace(/[&<>]/g, function(m) {
            if (m === "&") return "&amp;";
            if (m === "<") return "&lt;";
            if (m === ">") return "&gt;";
            return m;
        });
    }
    
    function formatTime(timestamp) {
        if (!timestamp) return "";
        const date = new Date(timestamp);
        const now = new Date();
        if (date.toDateString() === now.toDateString()) {
            return date.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
        }
        return date.toLocaleDateString();
    }
    
    // ===== Public API =====
    return {
        render,
        openChat,
        refresh: loadConversations
    };
    
})();

// Make global
window.MessagesPage = MessagesPage;
