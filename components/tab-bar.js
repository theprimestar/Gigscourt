// ========================================
// GigsCourt Floating Tab Bar Component
// Glass Pill Navigation + Active State
// ========================================

const TabBar = (function() {
    
    let tabBarElement = null;
    let currentActive = "home";
    
    // Tab definitions
    const tabs = [
        { id: "home", icon: "fas fa-home", label: "Home" },
        { id: "search", icon: "fas fa-search", label: "Search" },
        { id: "messages", icon: "fas fa-comment", label: "Messages" },
        { id: "profile", icon: "fas fa-user", label: "Profile" }
    ];
    
    // ===== Create Tab Bar HTML =====
    function createTabBar() {
        const container = document.createElement("div");
        container.className = "tab-bar";
        container.id = "tab-bar";
        
        tabs.forEach(tab => {
            const tabItem = document.createElement("div");
            tabItem.className = "tab-item";
            tabItem.dataset.page = tab.id;
            if (tab.id === currentActive) {
                tabItem.classList.add("active");
            }
            tabItem.innerHTML = `
                <i class="${tab.icon}"></i>
                <span>${tab.label}</span>
            `;
            tabItem.addEventListener("click", () => handleTabClick(tab.id));
            container.appendChild(tabItem);
        });
        
        return container;
    }
    
    // ===== Handle Tab Click =====
    function handleTabClick(pageId) {
        if (pageId === currentActive) return;
        
        // Update active state visually
        setActiveTab(pageId);
        
        // Navigate using Navigation system
        if (window.Navigation && typeof window.Navigation.navigateTo === "function") {
            window.Navigation.navigateTo(pageId, {}, true);
        } else {
            // Fallback
            window.location.hash = pageId;
            triggerPageChange(pageId);
        }
    }
    
    // ===== Set Active Tab Visually =====
    function setActiveTab(pageId) {
        const tabs = document.querySelectorAll(".tab-item");
        tabs.forEach(tab => {
            const tabPage = tab.dataset.page;
            if (tabPage === pageId) {
                tab.classList.add("active");
            } else {
                tab.classList.remove("active");
            }
        });
        currentActive = pageId;
    }
    
    // ===== Trigger Page Change (Fallback) =====
    function triggerPageChange(pageId) {
        const event = new CustomEvent("tab:change", { detail: { page: pageId } });
        document.dispatchEvent(event);
    }
    
    // ===== Get Current Active Tab =====
    function getCurrentTab() {
        return currentActive;
    }
    
    // ===== Show/Hide Tab Bar =====
    function show() {
        if (tabBarElement) {
            tabBarElement.style.display = "flex";
        }
    }
    
    function hide() {
        if (tabBarElement) {
            tabBarElement.style.display = "none";
        }
    }
    
    // ===== Hide on Certain Pages (e.g., chat, admin) =====
    function updateVisibility(pageId) {
        const hiddenPages = ["chat", "admin", "profile_view"];
        if (hiddenPages.includes(pageId)) {
            hide();
        } else {
            show();
        }
    }
    
    // ===== Listen to Navigation Events =====
    function setupListeners() {
        document.addEventListener("page:load", (e) => {
            if (e.detail && e.detail.page) {
                updateVisibility(e.detail.page);
                if (!hiddenPages.includes(e.detail.page)) {
                    setActiveTab(e.detail.page);
                }
            }
        });
    }
    
    // Hidden pages array
    const hiddenPages = ["chat", "admin", "profile_view", "gig_register"];
    
    // ===== Initialize =====
    function init() {
        // Check if tab bar already exists
        const existing = document.getElementById("tab-bar");
        if (existing) {
            tabBarElement = existing;
        } else {
            tabBarElement = createTabBar();
            document.body.appendChild(tabBarElement);
        }
        
        setupListeners();
        
        console.log("TabBar initialized");
    }
    
    // Public API
    return {
        init,
        setActiveTab,
        getCurrentTab,
        show,
        hide,
        updateVisibility
    };
    
})();

// Make global
window.TabBar = TabBar;

// Auto-initialize when DOM ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => TabBar.init());
} else {
    TabBar.init();
}
