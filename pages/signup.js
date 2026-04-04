// pages/signup.js
document.addEventListener('DOMContentLoaded', () => {
    const emailInput = document.getElementById('signup-email');
    const passwordInput = document.getElementById('signup-password');
    const signupBtn = document.getElementById('signup-btn');
    const gotoLogin = document.getElementById('goto-login');
    
    gotoLogin.addEventListener('click', (e) => {
        e.preventDefault();
        loadPage('login');
    });
    
    signupBtn.addEventListener('click', async () => {
        const email = emailInput.value.trim();
        const password = passwordInput.value;
        
        if (!email || !password) {
            alert('Please enter email and password');
            return;
        }
        
        if (password.length < 6) {
            alert('Password must be at least 6 characters');
            return;
        }
        
        signupBtn.textContent = 'Creating account...';
        signupBtn.disabled = true;
        
        try {
            const { data, error } = await window.supabaseClient.auth.signUp({
                email: email,
                password: password
            });
            
            if (error) throw error;
            
            alert('Account created! Please check your email to confirm.');
            loadPage('onboarding'); // Will create onboarding next
            
        } catch (error) {
            alert(error.message || 'Signup failed');
            signupBtn.textContent = 'Create Account';
            signupBtn.disabled = false;
        }
    });
});
