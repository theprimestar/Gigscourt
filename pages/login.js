// pages/login.js - Firebase Login
console.log('login.js loaded');

// Wait for elements to be ready
setTimeout(() => {
    const emailInput = document.getElementById('login-email');
    const passwordInput = document.getElementById('login-password');
    const loginBtn = document.getElementById('login-btn');
    const gotoSignup = document.getElementById('goto-signup');
    
    if (!emailInput) {
        console.error('Login elements not found');
        return;
    }
    
    gotoSignup.addEventListener('click', (e) => {
        e.preventDefault();
        loadPage('signup');
    });
    
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
            await window.firebaseAuth.signInWithEmailAndPassword(email, password);
            alert('Login successful!');
            loadPage('home');
        } catch (error) {
            console.error(error);
            let errorMessage = 'Login failed. ';
            if (error.code === 'auth/user-not-found') errorMessage += 'No account found.';
            else if (error.code === 'auth/wrong-password') errorMessage += 'Wrong password.';
            else if (error.code === 'auth/invalid-credential') errorMessage += 'Invalid email or password.';
            else errorMessage += error.message;
            alert(errorMessage);
            loginBtn.textContent = 'Login';
            loginBtn.disabled = false;
        }
    });
}, 100);
