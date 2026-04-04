// pages/home.js
console.log('Home page loaded');

const user = window.firebaseAuth.currentUser;
if (!user) {
    loadPage('login');
    return;
}

// Load user data from Firestore
window.firebaseDb.collection('users').doc(user.uid).get()
    .then(doc => {
        if (doc.exists) {
            const userData = doc.data();
            const welcomeDiv = document.getElementById('user-welcome');
            if (welcomeDiv) {
                welcomeDiv.innerHTML = `
                    <h2>Welcome back, ${userData.displayName || user.email}!</h2>
                    <p style="margin-top: 20px; color: #666;">Credits: ${userData.credits || 6}</p>
                    <p style="margin-top: 10px; color: #666;">Services: ${(userData.services || []).length} selected</p>
                `;
            }
            const creditsSpan = document.getElementById('credits-display');
            if (creditsSpan) {
                creditsSpan.textContent = userData.credits || 6;
            }
        } else {
            // No profile found - send back to onboarding
            alert('Profile not found. Please complete onboarding.');
            loadPage('onboarding-welcome');
        }
    })
    .catch(error => {
        console.error('Error loading user:', error);
        const welcomeDiv = document.getElementById('user-welcome');
        if (welcomeDiv) {
            welcomeDiv.innerHTML = `<p style="color:red;">Error loading profile. Please refresh.</p>`;
        }
    });
