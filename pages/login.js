// pages/login.js - Firebase Login
document.addEventListener('DOMContentLoaded', () => {
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const loginBtn = document.getElementById('login-btn');
    const gotoSignup = document.getElementById('goto-signup');
    
    // Check if user is already logged in
    if (window.firebaseAuth && window.firebaseAuth.currentUser) {
        console.log('User already logged in');
        loadPage('home');
        return;
    }
    
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
            const userCredential = await window.firebaseSignIn(window.firebaseAuth, email, password);
            console.log('Login successful:', userCredential.user.email);
            alert('Login successful!');
            loadPage('home');
        } catch (error) {
            console.error('Login error:', error);
            let errorMessage = 'Login failed. ';
            switch (error.code) {
                case 'auth/invalid-credential':
                    errorMessage += 'Invalid email or password.';
                    break;
                case 'auth/user-not-found':
                    errorMessage += 'No account found with this email.';
                    break;
                case 'auth/wrong-password':
                    errorMessage += 'Incorrect password.';
                    break;
                case 'auth/too-many-requests':
                    errorMessage += 'Too many failed attempts. Try again later.';
                    break;
                default:
                    errorMessage += error.message;
            }
            alert(errorMessage);
            loginBtn.textContent = 'Login';
            loginBtn.disabled = false;
        }
    });
});
