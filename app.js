// app.js - Main router
console.log('app.js loaded');

function loadPage(pageName) {
    const appContainer = document.getElementById('app');
    
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
            appContainer.innerHTML = `<div style="text-align:center; padding:50px;">Error: ${error.message}</div>`;
        });
}

// Start the app
loadPage('login');
