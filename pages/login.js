// pages/login.js
document.addEventListener('DOMContentLoaded', () => {
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const loginBtn = document.getElementById('login-btn');
    const gotoSignup = document.getElementById('goto-signup');
    
    // Redirect to signup
    gotoSignup.addEventListener('click', (e) => {
        e.preventDefault();
        loadPage('signup');
    });
    
    // Login function
    loginBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        
        if (!email || !password) {
            alert('Please enter email and password');
            return;
        }
        
        loginBtn.textContent = 'Logging in...';
        loginBtn.disabled = true;
        
        try {
            const { data, error } = await window.supabaseClient.auth.signInWithPassword({
                email: email,
                password: password
            });
            
            if (error) throw error;
            
            alert('Login successful!');
            loadPage('home'); // Will create home page later
            
        } catch (error) {
            alert(error.message || 'Login failed');
            loginBtn.textContent = 'Login';
            loginBtn.disabled = false;
        }
    });
});
