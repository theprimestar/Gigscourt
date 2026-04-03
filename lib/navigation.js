// ========================================
// GigsCourt Smart Navigation
// Industry-Standard Tab Navigation + Separate Stacks
// FIXED: Removed conflicting patch code
// ========================================

const Navigation = (function() {
    
    // Navigation stacks - ONE PER TAB
    let tabStacks = {
        home: [],
        search: [],
        messages: [],
        profile: []
    };
    
    let currentPage = "home";
    let currentTab = "home";
    let scrollPositions = new Map();
    
    // Root tabs (these reset/replace stack, not push)
    const ROOT_TABS = ["home", "search", "messages", "profile"];
    
    // Route definitions
    const routes = {
        home: { title: "Home", render: () => window.HomePage?.render(), isRoot: true },
        search: { title: "Search", render: () => window.SearchPage?.render(), isRoot: true },
        messages: { title: "Messages", render: () => window.MessagesPage?.render(), isRoot: true },
        profile: { title: "Profile", render: () => window.ProfilePage?.render(), isRoot: true },
        profile_view: { title: "Profile", render: (params) => window.ProfilePage?.render(params), isRoot: false },
        gig_detail: { title: "Gig Details", render: (params) => window.GigDetailPage?.render(params), isRoot: false },
        chat: { title: "Chat", render: (params) => window.MessagesPage?.openChat(params), isRoot: false },
        admin: { title: "Admin", render: () => window.Admin?.render(), isRoot: false }
    };
    
    // ===== Core Navigation (FIXED: added auth check) =====
    async function navigateTo(page, params = {}, addToStack = true) {
        // AUTH CHECK - protects all pages except home and auth
        const user = await window.SupabaseAPI?.getCurrentUser();
        if (!user && page !== "home" && page !== "auth") {
            if (window.AuthFlow) {
                window.AuthFlow.render();
                if (window.TabBar) window.TabBar.hide();
            }
            return;
        }
        
        const route = routes[page];
        if (!route) {
            console.error(`Route not found: ${page}`);
            return;
        }
        
        // Save current scroll position before leaving
        saveCurrentScrollPosition();
        
        // Determine if this is a root tab navigation
        const isRootTab = ROOT_TABS.includes(page);
        
        if (isRootTab) {
            // SWITCHING TABS: No history push, just switch active tab
            currentTab = page;
            currentPage = page;
            
            // Clear any pending back button state for this tab if needed
            if (!tabStacks[currentTab] || tabStacks[currentTab].length === 0) {
                // Initialize with root if empty
                tabStacks[currentTab] = [{ page, params, timestamp: Date.now() }];
            }
            
        } else {
            // DRILLING DOWN: Push onto current tab's stack
            if (addToStack) {
                tabStacks[currentTab].push({ page, params, timestamp: Date.now() });
            }
            currentPage = page;
        }
        
        // Render the page
        const contentContainer = document.getElementById("page-content");
        if (contentContainer) {
            const rendered = route.render ? route.render(params) : "";
            if (typeof rendered === "string") {
                contentContainer.innerHTML = rendered;
            }
        }
        
        // Update active tab in UI (only for root tabs)
        if (isRootTab) {
            updateActiveTab(page);
        } else {
            // Keep current tab active in UI while showing child page
            updateActiveTab(currentTab);
        }
        
        // Update back button visibility based on current tab's stack depth
        updateBackButton();
        
        // Update page title
        const tabName = isRootTab ? page : currentTab;
        const routeTitle = route.title;
        document.title = `${routeTitle} | GigsCourt`;
        
        // Restore scroll position for this page if exists
        restoreScrollPosition(page);
        
        // Trigger any page-specific initialization
        triggerPageLoad(page, params);
        
        // Notify TabBar to update visibility
        if (window.TabBar && window.TabBar.updateVisibility) {
            window.TabBar.updateVisibility(isRootTab ? page : currentPage);
        }
    }
    
    // ===== Smart Back Button - Pops current tab's stack =====
    function goBack() {
        const currentStack = tabStacks[currentTab];
        
        // If stack has only 1 item (the root), go to home? No - stay but no back
        if (!currentStack || currentStack.length <= 1) {
            // No back action - just stay on current tab
            updateBackButton();
            return;
        }
        
        // Pop current page from stack
        currentStack.pop();
        
        // Get previous page in this tab's stack
        const previous = currentStack[currentStack.length - 1];
        if (previous) {
            // Temporarily disable addToStack to avoid re-pushing
            const route = routes[previous.page];
            if (route && route.render) {
                currentPage = previous.page;
                
                // Render the previous page
                const contentContainer = document.getElementById("page-content");
                if (contentContainer) {
                    const rendered = route.render(previous.params);
                    if (typeof rendered === "string") {
                        contentContainer.innerHTML = rendered;
                    }
                }
                
                // Update title
                document.title = `${route.title} | GigsCourt`;
                
                // Trigger page load
                triggerPageLoad(previous.page, previous.params);
                
                // Restore scroll position
                restoreScrollPosition(previous.page);
            }
        }
        
        // Update back button visibility
        updateBackButton();
    }
    
    // ===== Deep Link Recovery =====
    function handleDeepLink() {
        const hash = window.location.hash.substring(1);
        if (!hash) return false;
        
        const parts = hash.split("/");
        const route = parts[0];
        const param = parts[1];
        
        const deepLinkRoutes = {
            "p": () => navigateTo("profile_view", { userId: param }, true),
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
        const currentStack = tabStacks[currentTab];
        const shouldShow = currentStack && currentStack.length > 1;
        
        if (shouldShow && !backBtn) {
            // Create back button
            backBtn = document.createElement("div");
            backBtn.className = "back-button";
            backBtn.innerHTML = '<i class="fas fa-arrow-left"></i>';
            backBtn.addEventListener("click", goBack);
            document.body.appendChild(backBtn);
        } else if (!shouldShow && backBtn) {
            backBtn.remove();
        }
    }
    
    function triggerPageLoad(page, params) {
        const event = new CustomEvent("page:load", { detail: { page, params } });
        document.dispatchEvent(event);
    }
    
    // ===== External Navigation API =====
    function getCurrentRoute() {
        return { 
            page: currentPage, 
            tab: currentTab,
            stackDepth: tabStacks[currentTab]?.length || 0 
        };
    }
    
    function clearHistoryForTab(tab) {
        if (tabStacks[tab]) {
            tabStacks[tab] = [{ page: tab, params: {}, timestamp: Date.now() }];
        }
        if (tab === currentTab) {
            updateBackButton();
        }
    }
    
    function replaceCurrentPage(page, params) {
        const currentStack = tabStacks[currentTab];
        if (currentStack && currentStack.length > 0) {
            currentStack[currentStack.length - 1] = { page, params, timestamp: Date.now() };
        }
        navigateTo(page, params, false);
    }
    
    // ===== Reset entire navigation (on logout) =====
    function reset() {
        tabStacks = {
            home: [{ page: "home", params: {}, timestamp: Date.now() }],
            search: [{ page: "search", params: {}, timestamp: Date.now() }],
            messages: [{ page: "messages", params: {}, timestamp: Date.now() }],
            profile: [{ page: "profile", params: {}, timestamp: Date.now() }]
        };
        currentTab = "home";
        currentPage = "home";
        updateBackButton();
        
        // Navigate to home
        navigateTo("home", {}, false);
    }
    
    // ===== Setup Tab Bar Listeners =====
    function setupTabBar() {
        const tabs = document.querySelectorAll(".tab-item");
        tabs.forEach(tab => {
            tab.addEventListener("click", (e) => {
                const page = tab.dataset.page;
                if (page && page !== currentTab) {
                    navigateTo(page, {}, true);
                }
            });
        });
    }
    
    // ===== Initialize Navigation =====
    async function init() {
        // Check auth first
        const user = await window.SupabaseAPI?.getCurrentUser();
        
        if (!user) {
            // No user - show auth flow
            if (window.AuthFlow) {
                window.AuthFlow.render();
                if (window.TabBar) window.TabBar.hide();
            }
        } else {
            // User exists - initialize normal navigation
            reset();
            setupTabBar();
            
            const deepLinkHandled = handleDeepLink();
            if (!deepLinkHandled) {
                navigateTo("home", {}, false);
            }
            
            window.addEventListener("popstate", (e) => {
                goBack();
            });
            
            window.addEventListener("beforeunload", () => {
                saveCurrentScrollPosition();
            });
            
            if (window.TabBar) window.TabBar.show();
        }
        
        console.log("Navigation initialized");
    }
    
    // Public API
    return {
        init,
        navigateTo,
        goBack,
        getCurrentRoute,
        clearHistoryForTab,
        replaceCurrentPage,
        saveScrollPosition: saveCurrentScrollPosition,
        restoreScrollPosition,
        reset
    };
    
})();

// Make global - THIS MUST BE HERE
window.Navigation = Navigation;
