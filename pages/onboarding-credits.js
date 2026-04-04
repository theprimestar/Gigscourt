// pages/onboarding-credits.js
console.log('Credits step loaded');

document.addEventListener('DOMContentLoaded', () => {
    const continueBtn = document.getElementById('credits-continue');
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            loadPage('home');
        });
    }
});
