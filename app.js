// app.js - Main router
console.log('app.js loaded');

function loadPage(pageName) {
    const appContainer = document.getElementById('app');
    
    appContainer.innerHTML = '<div style="text-align:center; padding:50px;">Loading...</div>';
    
    fetch(`pages/${pageName}.html`)
        .then(response => {
            if (!response.ok) throw new Error(`Page ${pageName} not found`);
            return response.text();
        })
        .then(html => {
            appContainer.innerHTML = html;
            
            const oldScript = document.getElementById('page-script');
            if (oldScript) oldScript.remove();
            
            const script = document.createElement('script');
            script.id = 'page-script';
            script.src = `pages/${pageName}.js`;
            document.body.appendChild(script);
        })
        .catch(error => {
            console.error('Error:', error);
            appContainer.innerHTML = `<div style="text-align:center; padding:50px; color:red;">Error: ${error.message}</div>`;
        });
}

// Check if user is logged in and has completed onboarding
const currentUser = window.firebaseAuth?.currentUser;

if (currentUser) {
    // Check if user has completed onboarding (has displayName and services)
    window.firebaseDb.collection('users').doc(currentUser.uid).get()
        .then(doc => {
            if (doc.exists) {
                const userData = doc.data();
                // If user has displayName AND services AND location, they completed onboarding
                if (userData.displayName && userData.services && userData.services.length > 0 && userData.location) {
                    console.log('User has completed onboarding');
                    loadPage('home');
                } else {
                    console.log('User needs onboarding');
                    loadPage('onboarding-welcome');
                }
            } else {
                // No profile document - needs onboarding
                console.log('No profile found, starting onboarding');
                loadPage('onboarding-welcome');
            }
        })
        .catch(error => {
            console.error('Error checking user:', error);
            loadPage('onboarding-welcome');
        });
} else {
    loadPage('login');
}
