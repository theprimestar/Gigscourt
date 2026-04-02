// ========================================
// GigsCourt Smart Navigation
// Deep Linking + Scroll Restore + Instant Back
// ========================================

const Navigation = (function() {
    
    // Navigation stack
    let historyStack = [];
    let currentPage = "home";
    let scrollPositions = new Map();
    
    // Route definitions
    const routes = {
        home: { title: "Home", render: () => window.HomePage?.render() },
        search: { title: "Search", render: () => window.SearchPage?.render() },
        messages: { title: "Messages", render: () => window.MessagesPage?.render() },
        profile: { title: "Profile", render: () => window.ProfilePage?.render() },
        profile_view: { title: "Profile", render: (username) => window.ProfilePage?.renderView(username) },
        gig_register: { title: "Register Gig", render: () => window.GigLoop?.renderRegister() },
        chat: { title: "Chat", render: (userId, userName) => window.MessagesPage?.renderChat(userId, userName) },
        admin: { title: "Admin", render: () => window.Admin?.render() }
    };
    
    // ===== Core Navigation =====
    function navigateTo(page, params = {}, addToStack = true) {
        const route = routes[page];
        if (!route) {
            console.error(`Route not found: ${page}`);
            return;
        }
        
        // Save current scroll position before leaving
        saveCurrentScrollPosition();
        
        // Add to history stack if needed
        if (addToStack && historyStack[historyStack.length - 1]?.page !== page) {
            historyStack.push({ page, params, timestamp: Date.now() });
        }
        
        // Update current page
        currentPage = page;
        
        // Render the page
        const contentContainer = document.getElementById("page-content");
        if (contentContainer) {
            const rendered = route.render ? route.render(params) : "";
            if (typeof rendered === "string") {
                contentContainer.innerHTML = rendered;
            }
        }
        
        // Update active tab in UI
        updateActiveTab(page);
        
        // Update back button visibility
        updateBackButton();
        
        // Update page title
        document.title = `${route.title} | GigsCourt`;
        
        // Restore scroll position for this page if exists
        restoreScrollPosition(page);
        
        // Trigger any page-specific initialization
        triggerPageLoad(page, params);
    }
    
    // ===== Smart Back Button =====
    function goBack() {
        if (historyStack.length <= 1) {
            // Empty stack - go to home
            navigateTo("home", {}, false);
            historyStack = [];
            return;
        }
        
        // Remove current page from stack
        historyStack.pop();
        
        // Get previous page
        const previous = historyStack[historyStack.length - 1];
        if (previous) {
            navigateTo(previous.page, previous.params, false);
        } else {
            navigateTo("home", {}, false);
        }
    }
    
    // ===== Deep Link Recovery =====
    function handleDeepLink() {
        const hash = window.location.hash.substring(1);
        if (!hash) return false;
        
        const parts = hash.split("/");
        const route = parts[0];
        const param = parts[1];
        
        const deepLinkRoutes = {
            "p": () => navigateTo("profile_view", { username: param }, true),
            "gig": () => navigateTo("gig_detail", { id: param }, true),
            "chat": () => navigateTo("chat", { userId: param }, true)
        };
        
        if (deepLinkRoutes[route]) {
            deepLinkRoutes[route]();
            return true;
        }
        return false;
    }
    
    // ===== Scroll Position Management =====
    function saveCurrentScrollPosition() {
        const scrollY = window.scrollY || document.documentElement.scrollTop;
        scrollPositions.set(currentPage, scrollY);
        
        // Also save to Cache system
        if (window.Cache) {
            window.Cache.saveScrollPosition(currentPage, scrollY);
        }
    }
    
    function restoreScrollPosition(page) {
        const savedPosition = scrollPositions.get(page);
        if (savedPosition && savedPosition > 0) {
            setTimeout(() => {
                window.scrollTo({ top: savedPosition, behavior: "instant" });
            }, 50);
        }
    }
    
    // ===== UI Helpers =====
    function updateActiveTab(page) {
        const tabs = document.querySelectorAll(".tab-item");
        tabs.forEach(tab => {
            const tabPage = tab.dataset.page;
            if (tabPage === page) {
                tab.classList.add("active");
            } else {
                tab.classList.remove("active");
            }
        });
    }
    
    function updateBackButton() {
        let backBtn = document.querySelector(".back-button");
        const shouldShow = historyStack.length > 1;
        
        if (shouldShow && !backBtn) {
            // Create back button
            backBtn = document.createElement("div");
            backBtn.className = "back-button";
            backBtn.innerHTML = '<i class="fas fa-arrow-left"></i>';
            backBtn.addEventListener("click", goBack);
            document.body.appendChild(backBtn);
        } else if (!shouldShow && backBtn) {
            backBtn.remove();
        } else if (backBtn) {
            // Update icon based on stack depth
            const icon = backBtn.querySelector("i");
            if (icon) {
                icon.className = historyStack.length <= 1 ? "fas fa-home" : "fas fa-arrow-left";
            }
        }
    }
    
    function triggerPageLoad(page, params) {
        // Dispatch custom event for page-specific init
        const event = new CustomEvent("page:load", { detail: { page, params } });
        document.dispatchEvent(event);
    }
    
    // ===== External Navigation (from deep links) =====
    function getCurrentRoute() {
        return { page: currentPage, stackDepth: historyStack.length };
    }
    
    function clearHistory() {
        historyStack = [];
        updateBackButton();
    }
    
    function replaceCurrentPage(page, params) {
        if (historyStack.length > 0) {
            historyStack[historyStack.length - 1] = { page, params, timestamp: Date.now() };
        }
        navigateTo(page, params, false);
    }
    
    // ===== Setup Tab Bar Listeners =====
    function setupTabBar() {
        const tabs = document.querySelectorAll(".tab-item");
        tabs.forEach(tab => {
            tab.addEventListener("click", (e) => {
                const page = tab.dataset.page;
                if (page && page !== currentPage) {
                    navigateTo(page, {}, true);
                }
            });
        });
    }
    
    // ===== Initialize Navigation =====
    function init() {
        setupTabBar();
        
        // Check for deep links
        const deepLinkHandled = handleDeepLink();
        
        if (!deepLinkHandled) {
            navigateTo("home", {}, false);
        }
        
        // Handle browser back button
        window.addEventListener("popstate", (e) => {
            goBack();
        });
        
        // Save scroll on beforeunload
        window.addEventListener("beforeunload", () => {
            saveCurrentScrollPosition();
        });
        
        console.log("Navigation initialized");
    }
    
    // Public API
    return {
        init,
        navigateTo,
        goBack,
        getCurrentRoute,
        clearHistory,
        replaceCurrentPage,
        saveScrollPosition: saveCurrentScrollPosition,
        restoreScrollPosition
    };
    
})();

// Make global
window.Navigation = Navigation;
