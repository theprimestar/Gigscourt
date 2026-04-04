// pages/onboarding-location.js
console.log('Location step loaded');

let userLocation = null;
let map = null;
let marker = null;

document.addEventListener('DOMContentLoaded', () => {
    const continueBtn = document.getElementById('location-continue');
    const useLocationBtn = document.getElementById('use-current-location');
    
    // Load Leaflet map
    const link = document.createElement('link');
    link.rel = 'stylesheet';
    link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
    document.head.appendChild(link);
    
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
        // Default: Lagos, Nigeria
        map = L.map('map').setView([6.5244, 3.3792], 13);
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);
        
        marker = L.marker([6.5244, 3.3792]).addTo(map);
        userLocation = { lat: 6.5244, lng: 3.3792 };
        
        map.on('click', (e) => {
            marker.setLatLng(e.latlng);
            userLocation = { lat: e.latlng.lat, lng: e.latlng.lng };
        });
    };
    document.body.appendChild(script);
    
    if (useLocationBtn) {
        useLocationBtn.addEventListener('click', () => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((pos) => {
                    const { latitude, longitude } = pos.coords;
                    if (map) {
                        map.setView([latitude, longitude], 14);
                        marker.setLatLng([latitude, longitude]);
                    }
                    userLocation = { lat: latitude, lng: longitude };
                    alert('Location updated!');
                }, () => {
                    alert('Could not get location. Please tap on map to set manually.');
                });
            } else {
                alert('Geolocation not supported. Please tap on map.');
            }
        });
    }
    
    if (continueBtn) {
        continueBtn.addEventListener('click', async () => {
            if (!userLocation) {
                alert('Please set your location by tapping on the map');
                return;
            }
            
            // Get all saved data
            const savedData = sessionStorage.getItem('onboardingData');
            if (!savedData) {
                alert('Error: No user data found');
                return;
            }
            
            const userData = JSON.parse(savedData);
            userData.location = userLocation;
            
            // Save to Firestore
            const currentUser = window.firebaseAuth.currentUser;
            if (!currentUser) {
                alert('Please log in again');
                loadPage('login');
                return;
            }
            
            try {
                await window.firebaseDb.collection('users').doc(currentUser.uid).set({
    displayName: userData.displayName,
    phoneNumber: userData.phoneNumber,
    services: userData.services,
    location: userData.location,
    profilePicture: userData.profilePicture || null,
    createdAt: new Date(),
    credits: 6,
    rating: 0,
    totalGigs: 0,
    onboardingCompleted: true
});
                
                // Clear session storage
                sessionStorage.removeItem('onboardingData');
                
                loadPage('onboarding-credits');
            } catch (error) {
                console.error('Save error:', error);
                alert('Error saving data: ' + error.message);
            }
        });
    }
});
