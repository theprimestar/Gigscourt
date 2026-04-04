// pages/splash.js
// Splash screen with 1.5 second fade out

setTimeout(() => {
    const container = document.querySelector('.splash-container');
    if (container) {
        container.style.opacity = '0';
        container.style.transition = 'opacity 0.8s ease';
        
        setTimeout(() => {
            // After fade, redirect to login
            loadPage('login');
        }, 800);
    }
}, 1500);
