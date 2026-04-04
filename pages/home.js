// pages/home.js
console.log('Home page loaded');
const user = window.firebaseAuth.currentUser;
if (!user) {
    loadPage('login');
}
