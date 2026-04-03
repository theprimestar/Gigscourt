// ========================================
// GigsCourt Smart Back Button Component
// FIXED: No duplicate with navigation.js
// Now works as FALLBACK only
// ========================================

const BackButton = (function() {
    
    let buttonElement = null;
    let isVisible = false;
    let isEnabled = true;
    
    // ===== Check if navigation.js already has back button =====
    function shouldEnable() {
        // If navigation.js is handling back button, disable this component
        if (window.Navigation && window.Navigation._hasBackButton !== false) {
            // Navigation.js creates its own back button via updateBackButton()
            // So we should NOT create another one
            return false;
        }
        return true;
    }
    
    // ===== Create Button Element =====
    function createButton() {
        const btn = document.createElement("div");
        btn.className = "back-button";
        btn.innerHTML = '<i class="fas fa-arrow-left"></i>';
        btn.style.cssText = `
            position: fixed;
            top: 54px;
            left: 20px;
            width: 44px;
            height: 44px;
            background: var(--bg-glass);
            backdrop-filter: blur(20px);
            -webkit-backdrop-filter: blur(20px);
            border-radius: 50%;
            display: flex;
            align-items: center;
            justify-content: center;
            cursor: pointer;
            z-index: 1000;
            box-shadow: var(--shadow-sm);
            transition: all 0.2s ease;
        `;
        
        btn.addEventListener("click", (e) => {
            e.stopPropagation();
            handleBackPress();
        });
        
        return btn;
    }
    
    // ===== Handle Back Press =====
    function handleBackPress() {
        if (window.Navigation && typeof window.Navigation.goBack === "function") {
            window.Navigation.goBack();
        } else if (window.history.length > 1) {
            window.history.back();
        } else if (window.Navigation && typeof window.Navigation.navigateTo === "function") {
            window.Navigation.navigateTo("home", {}, false);
        } else {
            window.location.hash = "#home";
            window.location.reload();
        }
    }
    
    // ===== Detect if Stack is Empty =====
    function isNavigationStackEmpty() {
        if (window.Navigation && window.Navigation.getCurrentRoute) {
            const route = window.Navigation.getCurrentRoute();
            return route.stackDepth <= 1;
        }
        return window.history.length <= 1;
    }
    
    // ===== Update Button Icon =====
    function updateIcon() {
        if (!buttonElement) return;
        
        const isEmpty = isNavigationStackEmpty();
        const icon = buttonElement.querySelector("i");
        
        if (icon) {
            if (isEmpty) {
                icon.className = "fas fa-home";
                buttonElement.style.background = "var(--accent-burnt-orange)";
                buttonElement.style.boxShadow = "0 0 12px var(--accent-burnt-orange-glow)";
            } else {
                icon.className = "fas fa-arrow-left";
                buttonElement.style.background = "var(--bg-glass)";
                buttonElement.style.boxShadow = "var(--shadow-sm)";
            }
        }
    }
    
    // ===== Show/Hide =====
    function show() {
        if (!isEnabled) return;
        
        if (!buttonElement) {
            buttonElement = createButton();
            document.body.appendChild(buttonElement);
        }
        buttonElement.style.display = "flex";
        isVisible = true;
        updateIcon();
    }
    
    function hide() {
        if (buttonElement) {
            buttonElement.style.display = "none";
        }
        isVisible = false;
    }
    
    function toggle(shouldShow) {
        if (shouldShow) {
            show();
        } else {
            hide();
        }
    }
    
    // ===== Auto-manage Visibility =====
    function updateVisibility() {
        if (!isEnabled) return;
        
        if (window.Navigation && window.Navigation.getCurrentRoute) {
            const route = window.Navigation.getCurrentRoute();
            const shouldShow = route.stackDepth > 1;
            toggle(shouldShow);
        } else {
            const isHome = window.location.hash === "#home" || 
                          window.location.pathname === "/" || 
                          !window.location.hash;
            toggle(!isHome);
        }
    }
    
    // ===== Setup Listeners =====
    function setupListeners() {
        document.addEventListener("page:load", () => {
            setTimeout(() => {
                updateVisibility();
                updateIcon();
            }, 10);
        });
        
        window.addEventListener("popstate", () => {
            setTimeout(() => {
                updateVisibility();
                updateIcon();
            }, 10);
        });
    }
    
    // ===== Disable this component (if navigation.js handles it) =====
    function disable() {
        isEnabled = false;
        hide();
    }
    
    function enable() {
        isEnabled = true;
        updateVisibility();
    }
    
    // ===== Initialize =====
    function init() {
        // Check if we should run at all
        if (!shouldEnable()) {
            console.log("BackButton: Disabled because navigation.js is handling back button");
            isEnabled = false;
            return;
        }
        
        setupListeners();
        
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => {
                updateVisibility();
            });
        } else {
            updateVisibility();
        }
        
        console.log("BackButton initialized (fallback mode)");
    }
    
    // Public API
    return {
        init,
        show,
        hide,
        toggle,
        updateIcon,
        disable,
        enable,
        isVisible: () => isVisible
    };
    
})();

// Make global
window.BackButton = BackButton;

// Auto-initialize - but will disable itself if navigation.js is handling back button
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => BackButton.init());
} else {
    BackButton.init();
}
