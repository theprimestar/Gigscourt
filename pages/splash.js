// pages/splash.js
// 1-2 second fade animation

setTimeout(() => {
    const container = document.querySelector('.splash-container');
    if (container) {
        container.style.opacity = '0';
        container.style.transition = 'opacity 0.5s ease';
        
        setTimeout(() => {
            loadPage('login');
        }, 500);
    }
}, 1500);
