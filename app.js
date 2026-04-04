// app.js - Main router for GigsCourt
window.addEventListener('DOMContentLoaded', () => {
    console.log('🚀 GigsCourt starting...');
    loadPage('login');
});

function loadPage(pageName) {
    const appContainer = document.getElementById('app');
    
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
            console.error('Error loading page:', error);
            appContainer.innerHTML = `<div style="text-align:center; padding:50px; color:red;">Error loading page. Check console.</div>`;
        });
}
