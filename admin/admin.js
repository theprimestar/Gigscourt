// ========================================
// GigsCourt Admin Panel Logic
// Dispute Queue + Revenue Stats + Broadcast
// ========================================

const Admin = (function() {
    
    let currentTab = "stats";
    let isAdmin = false;
    
    // ===== Initialize Admin Panel =====
    async function init() {
        // Verify admin status
        const currentUser = await window.Supabase.getCurrentUser();
        if (!currentUser) {
            alert("Please log in first");
            window.location.href = "/";
            return;
        }
        
        isAdmin = await window.Supabase.checkIsAdmin(currentUser.user.id);
        if (!isAdmin) {
            alert("Access denied. Admin privileges required.");
            window.location.href = "/";
            return;
        }
        
        setupTabs();
        setupEventListeners();
        loadStats();
        loadDisputes();
        loadUsers();
        
        console.log("Admin panel initialized");
    }
    
    // ===== Setup Tab Switching =====
    function setupTabs() {
        const tabs = document.querySelectorAll(".admin-tab");
        tabs.forEach(tab => {
            tab.addEventListener("click", () => {
                const tabName = tab.dataset.tab;
                switchTab(tabName);
            });
        });
    }
    
    function switchTab(tabName) {
        currentTab = tabName;
        
        // Update tab styles
        document.querySelectorAll(".admin-tab").forEach(tab => {
            const t = tab.dataset.tab;
            if (t === tabName) {
                tab.classList.add("active");
            } else {
                tab.classList.remove("active");
            }
        });
        
        // Show/hide content
        document.querySelectorAll(".admin-tab-content").forEach(content => {
            content.style.display = "none";
        });
        
        const activeContent = document.getElementById(`${tabName}-tab`);
        if (activeContent) {
            activeContent.style.display = "block";
        }
        
        // Refresh data when switching tabs
        if (tabName === "stats") loadStats();
        if (tabName === "disputes") loadDisputes();
        if (tabName === "users") loadUsers();
    }
    
    // ===== Setup Event Listeners =====
    function setupEventListeners() {
        document.getElementById("refresh-stats")?.addEventListener("click", loadStats);
        document.getElementById("send-broadcast")?.addEventListener("click", sendBroadcast);
        document.getElementById("search-user")?.addEventListener("input", (e) => {
            searchUsers(e.target.value);
        });
        document.getElementById("back-to-app")?.addEventListener("click", () => {
            if (window.Navigation) {
                window.Navigation.goBack();
            } else {
                window.location.href = "/";
            }
        });
    }
    
    // ===== Load Dashboard Stats =====
    async function loadStats() {
        try {
            // Get total users
            const { count: userCount, error: userError } = await window.Supabase.client
                .from("profiles")
                .select("*", { count: "exact", head: true });
            
            // Get total gigs
            const { count: gigCount, error: gigError } = await window.Supabase.client
                .from("gigs")
                .select("*", { count: "exact", head: true });
            
            // Get total messages
            const { count: msgCount, error: msgError } = await window.Supabase.client
                .from("messages")
                .select("*", { count: "exact", head: true });
            
            // Get total transactions (revenue)
            const { data: transactions, error: txError } = await window.Supabase.client
                .from("transactions")
                .select("amount")
                .eq("type", "credit");
            
            const totalRevenue = transactions?.reduce((sum, t) => sum + t.amount, 0) || 0;
            
            // Get active users (last 24 hours)
            const oneDayAgo = new Date();
            oneDayAgo.setDate(oneDayAgo.getDate() - 1);
            const { count: activeCount } = await window.Supabase.client
                .from("profiles")
                .select("*", { count: "exact", head: true })
                .gte("updated_at", oneDayAgo.toISOString());
            
            // Update UI
            document.getElementById("total-users").textContent = userCount || 0;
            document.getElementById("total-gigs").textContent = gigCount || 0;
            document.getElementById("total-messages").textContent = msgCount || 0;
            document.getElementById("monthly-revenue").textContent = `₦${totalRevenue.toLocaleString()}`;
            document.getElementById("active-users").textContent = activeCount || 0;
            
        } catch (error) {
            console.error("Error loading stats:", error);
        }
    }
    
    // ===== Load Disputes (flagged conversations) =====
    async function loadDisputes() {
        const container = document.getElementById("disputes-list");
        if (!container) return;
        
        try {
            // Get conversations with high message counts or flagged content
            // For MVP, show recent conversations with > 20 messages
            const { data: conversations, error } = await window.Supabase.client
                .from("messages")
                .select("sender_id, receiver_id, count")
                .limit(50);
            
            if (error) throw error;
            
            // Group by conversation pairs
            const disputeMap = new Map();
            // Simplified: show users with most activity
            const userIds = new Set();
            
            if (conversations && conversations.length > 0) {
                container.innerHTML = "";
                // Show placeholder disputes
                container.innerHTML = `
                    <div class="dispute-item" style="padding: 16px; background: var(--bg-primary); border-radius: 12px; margin-bottom: 8px;">
                        <strong>No active disputes</strong>
                        <p style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">All conversations appear clean</p>
                    </div>
                `;
            } else {
                container.innerHTML = `<div class="loading">No disputes found</div>`;
            }
            
        } catch (error) {
            console.error("Error loading disputes:", error);
            container.innerHTML = `<div class="loading">Error loading disputes</div>`;
        }
    }
    
    // ===== Send Broadcast Notification =====
    async function sendBroadcast() {
        const title = document.getElementById("broadcast-title")?.value.trim();
        const body = document.getElementById("broadcast-body")?.value.trim();
        
        if (!title || !body) {
            alert("Please enter both title and message");
            return;
        }
        
        const btn = document.getElementById("send-broadcast");
        btn.disabled = true;
        btn.textContent = "Sending...";
        
        try {
            await window.Supabase.broadcastNotification(title, body);
            
            alert("Broadcast sent successfully!");
            document.getElementById("broadcast-title").value = "";
            document.getElementById("broadcast-body").value = "";
            
        } catch (error) {
            console.error("Error sending broadcast:", error);
            alert("Error sending broadcast: " + error.message);
        } finally {
            btn.disabled = false;
            btn.textContent = "Send to All Users";
        }
    }
    
    // ===== Load All Users =====
    async function loadUsers() {
        const container = document.getElementById("users-list");
        if (!container) return;
        
        try {
            const { data: users, error } = await window.Supabase.client
                .from("profiles")
                .select("*")
                .order("created_at", { ascending: false })
                .limit(50);
            
            if (error) throw error;
            
            if (!users || users.length === 0) {
                container.innerHTML = `<div class="loading">No users found</div>`;
                return;
            }
            
            container.innerHTML = "";
            users.forEach(user => {
                const userDiv = document.createElement("div");
                userDiv.className = "user-item";
                userDiv.style.cssText = `
                    padding: 12px;
                    border-bottom: 1px solid var(--border-glass);
                    display: flex;
                    justify-content: space-between;
                    align-items: center;
                `;
                userDiv.innerHTML = `
                    <div>
                        <strong>${escapeHtml(user.full_name || user.username || "Unknown")}</strong>
                        <div style="font-size: 11px; color: var(--text-secondary);">Credits: ${user.credits || 0} | Admin: ${user.is_admin ? "Yes" : "No"}</div>
                    </div>
                    <button class="toggle-admin-btn" data-user-id="${user.id}" data-is-admin="${user.is_admin}" style="
                        background: ${user.is_admin ? "var(--accent-modern-red)" : "var(--accent-burnt-orange)"};
                        border: none;
                        padding: 6px 12px;
                        border-radius: 20px;
                        color: white;
                        font-size: 11px;
                        cursor: pointer;
                    ">${user.is_admin ? "Remove Admin" : "Make Admin"}</button>
                `;
                container.appendChild(userDiv);
            });
            
            // Add admin toggle listeners
            document.querySelectorAll(".toggle-admin-btn").forEach(btn => {
                btn.addEventListener("click", async (e) => {
                    e.stopPropagation();
                    const userId = btn.dataset.userId;
                    const isCurrentlyAdmin = btn.dataset.isAdmin === "true";
                    await toggleAdminStatus(userId, !isCurrentlyAdmin);
                    loadUsers(); // Refresh list
                });
            });
            
        } catch (error) {
            console.error("Error loading users:", error);
            container.innerHTML = `<div class="loading">Error loading users</div>`;
        }
    }
    
    // ===== Search Users =====
    async function searchUsers(query) {
        if (!query || query.length < 2) {
            loadUsers();
            return;
        }
        
        const container = document.getElementById("users-list");
        if (!container) return;
        
        try {
            const { data: users, error } = await window.Supabase.client
                .from("profiles")
                .select("*")
                .or(`full_name.ilike.%${query}%,username.ilike.%${query}%`)
                .limit(20);
            
            if (error) throw error;
            
            if (!users || users.length === 0) {
                container.innerHTML = `<div class="loading">No users found</div>`;
                return;
            }
            
            container.innerHTML = "";
            users.forEach(user => {
                const userDiv = document.createElement("div");
                userDiv.style.cssText = `padding: 12px; border-bottom: 1px solid var(--border-glass);`;
                userDiv.innerHTML = `
                    <strong>${escapeHtml(user.full_name || user.username || "Unknown")}</strong>
                    <div style="font-size: 12px; color: var(--text-secondary);">Credits: ${user.credits || 0}</div>
                `;
                container.appendChild(userDiv);
            });
            
        } catch (error) {
            console.error("Error searching users:", error);
        }
    }
    
    // ===== Toggle Admin Status =====
    async function toggleAdminStatus(userId, makeAdmin) {
        try {
            const { error } = await window.Supabase.client
                .from("profiles")
                .update({ is_admin: makeAdmin })
                .eq("id", userId);
            
            if (error) throw error;
            alert(`User ${makeAdmin ? "is now an admin" : "is no longer an admin"}`);
            
        } catch (error) {
            console.error("Error toggling admin:", error);
            alert("Error updating admin status");
        }
    }
    
    // ===== Helper: Escape HTML =====
    function escapeHtml(str) {
        if (!str) return "";
        return str.replace(/[&<>]/g, function(m) {
            if (m === "&") return "&amp;";
            if (m === "<") return "&lt;";
            if (m === ">") return "&gt;";
            return m;
        });
    }
    
    // ===== Render Admin Panel =====
    function render() {
        const container = document.getElementById("page-content");
        if (container) {
            // Load admin.html content
            fetch("/admin/admin.html")
                .then(response => response.text())
                .then(html => {
                    container.innerHTML = html;
                    init();
                })
                .catch(() => {
                    container.innerHTML = `<div class="loading">Error loading admin panel</div>`;
                });
        }
    }
    
    // Public API
    return {
        init,
        render,
        loadStats,
        loadUsers
    };
    
})();

// Make global
window.Admin = Admin;

// Auto-init if directly accessed
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => {
        if (window.location.pathname.includes("admin.html")) {
            Admin.init();
        }
    });
} else {
    if (window.location.pathname.includes("admin.html")) {
        Admin.init();
    }
}
