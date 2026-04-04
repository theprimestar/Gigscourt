// pages/onboarding-account.js
console.log('Account step loaded');

let userData = {
    displayName: '',
    phoneNumber: '',
    profilePicture: null
};

document.addEventListener('DOMContentLoaded', () => {
    const displayNameInput = document.getElementById('display-name');
    const phoneInput = document.getElementById('phone-number');
    const uploadBtn = document.getElementById('upload-photo');
    const photoInput = document.getElementById('photo-input');
    const continueBtn = document.getElementById('account-continue');
    
    if (uploadBtn && photoInput) {
        uploadBtn.addEventListener('click', () => {
            photoInput.click();
        });
        
        photoInput.addEventListener('change', (e) => {
            const file = e.target.files[0];
            if (file) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    userData.profilePicture = event.target.result;
                    uploadBtn.textContent = '✓ Photo selected';
                    uploadBtn.style.background = '#CC5500';
                    uploadBtn.style.color = 'white';
                };
                reader.readAsDataURL(file);
            }
        });
    }
    
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            const displayName = displayNameInput ? displayNameInput.value.trim() : '';
            const phone = phoneInput ? phoneInput.value.trim() : '';
            
            if (!displayName || !phone) {
                alert('Display name and phone number are required');
                return;
            }
            
            // Save to sessionStorage to pass to next step
            sessionStorage.setItem('onboardingData', JSON.stringify({
                displayName: displayName,
                phoneNumber: phone,
                profilePicture: userData.profilePicture
            }));
            
            loadPage('onboarding-services');
        });
    }
});
