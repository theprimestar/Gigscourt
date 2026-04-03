// ========================================
// GigsCourt Floating Tab Bar Component
// Glass Pill Navigation + Active State
// PURE UI - delegates navigation to Navigation API
// ========================================

const TabBar = (function() {
    
    let tabBarElement = null;
    let currentActive = "home";
    let isInitialized = false;
    
    // Tab definitions
    const tabs = [
        { id: "home", icon: "fas fa-home", label: "Home" },
        { id: "search", icon: "fas fa-search", label: "Search" },
        { id: "messages", icon: "fas fa-comment", label: "Messages" },
        { id: "profile", icon: "fas fa-user", label: "Profile" }
    ];
    
    // Pages where tab bar should be hidden
    const hiddenPages = ["chat", "admin", "profile_view", "gig_register"];
    
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
            // DELEGATE to Navigation API - no direct routing logic here
            tabItem.addEventListener("click", (e) => {
                e.preventDefault();
                if (window.Navigation && typeof window.Navigation.navigateTo === "function") {
                    window.Navigation.navigateTo(tab.id, {}, true);
                } else {
                    console.warn('Navigation API not available');
                }
            });
            container.appendChild(tabItem);
        });
        
        return container;
    }
    
    // ===== Set Active Tab Visually =====
    function setActiveTab(pageId) {
        if (!tabBarElement) return;
        
        const tabs = tabBarElement.querySelectorAll(".tab-item");
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
    
    // ===== Update visibility based on current page =====
    function updateVisibility(pageId) {
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
    
    // ===== Initialize =====
    function init() {
        if (isInitialized) return;
        
        // Wait for DOM
        const doInit = () => {
            // Check if tab bar already exists (from inline HTML - remove if found)
            const existing = document.getElementById("tab-bar");
            if (existing && existing !== tabBarElement) {
                existing.remove();
                console.log('Removed duplicate inline tab bar');
            }
            
            // Create fresh tab bar
            tabBarElement = createTabBar();
            document.body.appendChild(tabBarElement);
            
            setupListeners();
            isInitialized = true;
            console.log('TabBar initialized');
        };
        
        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', doInit);
        } else {
            doInit();
        }
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

window.TabBar = TabBar;
