// app.js - Main router
console.log('app.js loaded');

function loadPage(pageName) {
    const appContainer = document.getElementById('app');
    
    // Show loading indicator
    appContainer.innerHTML = '<div style="text-align:center; padding:50px;">Loading...</div>';
    
    fetch(`pages/${pageName}.html`)
        .then(response => {
            if (!response.ok) throw new Error(`Page ${pageName} not found`);
            return response.text();
        })
        .then(html => {
            appContainer.innerHTML = html;
            
            // Remove old page script
            const oldScript = document.getElementById('page-script');
            if (oldScript) oldScript.remove();
            
            // Load new page script
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

// Start the app
const currentUser = window.firebaseAuth?.currentUser;
if (currentUser) {
    // Check if user has completed onboarding
    window.firebaseDb.collection('users').doc(currentUser.uid).get()
        .then(doc => {
            if (doc.exists && doc.data().onboardingCompleted) {
                loadPage('home');
            } else {
                loadPage('onboarding-welcome');
            }
        })
        .catch(() => {
            loadPage('onboarding-welcome');
        });
} else {
    loadPage('login');
}
