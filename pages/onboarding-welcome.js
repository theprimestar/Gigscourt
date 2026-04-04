// pages/onboarding-welcome.js
console.log('Welcome step loaded');

document.addEventListener('DOMContentLoaded', () => {
    const continueBtn = document.getElementById('welcome-continue');
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            loadPage('onboarding-account');
        });
    }
});
