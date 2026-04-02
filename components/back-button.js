// ========================================
// GigsCourt Smart Back Button Component
// Deep Link Detection + Empty Stack Handling
// ========================================

const BackButton = (function() {
    
    let buttonElement = null;
    let isVisible = false;
    
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
        // Check if Navigation system exists
        if (window.Navigation && typeof window.Navigation.goBack === "function") {
            window.Navigation.goBack();
        } else {
            // Fallback: use browser history
            if (window.history.length > 1) {
                window.history.back();
            } else {
                // Empty stack - go to home via Navigation or window location
                if (window.Navigation && typeof window.Navigation.navigateTo === "function") {
                    window.Navigation.navigateTo("home", {}, false);
                } else {
                    window.location.hash = "#home";
                    window.location.reload();
                }
            }
        }
    }
    
    // ===== Detect if Stack is Empty (Deep Link Entry) =====
    function isNavigationStackEmpty() {
        if (window.Navigation && window.Navigation.getCurrentRoute) {
            const route = window.Navigation.getCurrentRoute();
            return route.stackDepth <= 1;
        }
        
        // Check browser history length
        return window.history.length <= 1;
    }
    
    // ===== Update Button Icon Based on Stack =====
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
    
    // ===== Show/Hide Button =====
    function show() {
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
    
    // ===== Auto-manage Based on Current Page =====
    function updateVisibility() {
        if (window.Navigation && window.Navigation.getCurrentRoute) {
            const route = window.Navigation.getCurrentRoute();
            // Show back button on all pages except home when stack is deep
            const shouldShow = route.stackDepth > 1;
            toggle(shouldShow);
        } else {
            // Default: show on non-home pages
            const isHome = window.location.hash === "#home" || 
                          window.location.pathname === "/" || 
                          !window.location.hash;
            toggle(!isHome);
        }
    }
    
    // ===== Listen to Navigation Events =====
    function setupListeners() {
        // Listen for navigation changes
        document.addEventListener("page:load", () => {
            setTimeout(() => {
                updateVisibility();
                updateIcon();
            }, 10);
        });
        
        // Also listen to popstate (browser back)
        window.addEventListener("popstate", () => {
            setTimeout(() => {
                updateVisibility();
                updateIcon();
            }, 10);
        });
    }
    
    // ===== Initialize =====
    function init() {
        setupListeners();
        
        // Initial check after DOM ready
        if (document.readyState === "loading") {
            document.addEventListener("DOMContentLoaded", () => {
                updateVisibility();
            });
        } else {
            updateVisibility();
        }
        
        console.log("BackButton initialized");
    }
    
    // Public API
    return {
        init,
        show,
        hide,
        toggle,
        updateIcon,
        isVisible: () => isVisible
    };
    
})();

// Make global
window.BackButton = BackButton;

// Auto-initialize when DOM ready
if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", () => BackButton.init());
} else {
    BackButton.init();
}
