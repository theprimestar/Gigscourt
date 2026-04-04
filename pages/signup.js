// pages/signup.js - Firebase Signup
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
            const userCredential = await window.firebaseSignUp(window.firebaseAuth, email, password);
            console.log('Signup successful:', userCredential.user.email);
            alert('Account created successfully!');
            loadPage('onboarding');
        } catch (error) {
            console.error('Signup error:', error);
            let errorMessage = 'Signup failed. ';
            switch (error.code) {
                case 'auth/email-already-in-use':
                    errorMessage += 'Email already registered. Try logging in.';
                    break;
                case 'auth/invalid-email':
                    errorMessage += 'Invalid email address.';
                    break;
                case 'auth/weak-password':
                    errorMessage += 'Password should be at least 6 characters.';
                    break;
                default:
                    errorMessage += error.message;
            }
            alert(errorMessage);
            signupBtn.textContent = 'Create Account';
            signupBtn.disabled = false;
        }
    });
});
