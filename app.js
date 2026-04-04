// app.js - Main router
// Step 5: Loads splash page only

// Wait for everything to load
window.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 GigsCourt starting...');
    
    // Load the splash page
    loadPage('splash');
});

function loadPage(pageName) {
    const appContainer = document.getElementById('app');
    
    // Fetch the HTML for the requested page
    fetch(`pages/${pageName}.html`)
        .then(response => {
            if (!response.ok) {
                throw new Error(`Page ${pageName} not found`);
            }
            return response.text();
        })
        .then(html => {
            appContainer.innerHTML = html;
            
            // Load the corresponding JavaScript for this page
            const script = document.createElement('script');
            script.src = `pages/${pageName}.js`;
            document.body.appendChild(script);
        })
        .catch(error => {
            console.error('Error loading page:', error);
            appContainer.innerHTML = `<div style="text-align:center; padding:50px;">
                <h2>⚠️ Error Loading Page</h2>
                <p>Check console for details</p>
            </div>`;
        });
}
