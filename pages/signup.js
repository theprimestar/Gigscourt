// pages/signup.js - Firebase Signup
console.log('signup.js loaded');

setTimeout(() => {
    const emailInput = document.getElementById('signup-email');
    const passwordInput = document.getElementById('signup-password');
    const signupBtn = document.getElementById('signup-btn');
    const gotoLogin = document.getElementById('goto-login');
    
    if (!emailInput) {
        console.error('Signup elements not found');
        return;
    }
    
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
            await window.firebaseAuth.createUserWithEmailAndPassword(email, password);
            alert('Account created successfully!');
            loadPage('onboarding');
        } catch (error) {
            console.error(error);
            let errorMessage = 'Signup failed. ';
            if (error.code === 'auth/email-already-in-use') errorMessage += 'Email already registered.';
            else if (error.code === 'auth/invalid-email') errorMessage += 'Invalid email.';
            else if (error.code === 'auth/weak-password') errorMessage += 'Password too weak. Use 6+ characters.';
            else errorMessage += error.message;
            alert(errorMessage);
            signupBtn.textContent = 'Create Account';
            signupBtn.disabled = false;
        }
    });
}, 100);
