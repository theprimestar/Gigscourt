// pages/onboarding.js - Complete Onboarding Controller
console.log('onboarding.js loaded');

let currentStep = 1;
let userData = {
    displayName: '',
    phoneNumber: '',
    profilePicture: null,
    services: [],
    location: null
};

// Service list (30 presets)
const presetServices = [
    "Tailoring / fashion design", "Barbing", "Hairdressing", "Makeup artistry",
    "Shoe making / cobbling", "Phone repairs", "Computer repairs", "Electrical installation",
    "Plumbing", "Carpentry / furniture making", "Masonry / bricklaying", "Welding / metal fabrication",
    "Tiling", "POP ceiling installation", "Painting", "Auto mechanic",
    "Motorcycle/tricycle repair", "Catering", "Baking", "Event decoration",
    "CCTV installation", "Solar panel installation", "Generator repair", "AC repair",
    "Aluminum work", "Interior decoration", "Laundry / dry cleaning", "Upholstery",
    "Printing & branding", "POP screeding / wall finishing"
];

// Get current user
const currentUser = window.firebaseAuth.currentUser;
if (!currentUser) {
    alert('Please sign up first');
    loadPage('signup');
}

// Step 1: Welcome
if (window.location.href.includes('onboarding-welcome')) {
    document.getElementById('welcome-continue')?.addEventListener('click', () => {
        loadPage('onboarding-account');
    });
}

// Step 2: Account Info
if (window.location.href.includes('onboarding-account')) {
    const displayNameInput = document.getElementById('display-name');
    const phoneInput = document.getElementById('phone-number');
    const uploadBtn = document.getElementById('upload-photo');
    const photoInput = document.getElementById('photo-input');
    const continueBtn = document.getElementById('account-continue');
    
    uploadBtn?.addEventListener('click', () => {
        photoInput.click();
    });
    
    photoInput?.addEventListener('change', (e) => {
        const file = e.target.files[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                userData.profilePicture = event.target.result;
                uploadBtn.textContent = '✓ Photo selected';
                uploadBtn.style.background = '#CC5500';
                uploadBtn.style.color = 'white';
            };
            reader.readAsDataURL(file);
        }
    });
    
    continueBtn?.addEventListener('click', async () => {
        const displayName = displayNameInput.value.trim();
        const phone = phoneInput.value.trim();
        
        if (!displayName || !phone) {
            alert('Display name and phone number are required');
            return;
        }
        
        userData.displayName = displayName;
        userData.phoneNumber = phone;
        
        loadPage('onboarding-services');
    });
}

// Step 3: Services Selection
if (window.location.href.includes('onboarding-services')) {
    const servicesContainer = document.getElementById('services-list');
    const addCustomBtn = document.getElementById('add-custom-service');
    const continueBtn = document.getElementById('services-continue');
    
    // Display preset services
    presetServices.forEach(service => {
        const chip = document.createElement('div');
        chip.className = 'service-chip';
        chip.textContent = service;
        chip.onclick = () => {
            chip.classList.toggle('selected');
            if (chip.classList.contains('selected')) {
                userData.services.push(service);
            } else {
                userData.services = userData.services.filter(s => s !== service);
            }
        };
        servicesContainer.appendChild(chip);
    });
    
    addCustomBtn?.addEventListener('click', () => {
        const customService = prompt('Enter your custom service:');
        if (customService && customService.trim()) {
            userData.services.push(customService.trim());
            const chip = document.createElement('div');
            chip.className = 'service-chip selected';
            chip.textContent = customService.trim();
            chip.onclick = () => {
                chip.remove();
                userData.services = userData.services.filter(s => s !== customService.trim());
            };
            servicesContainer.appendChild(chip);
        }
    });
    
    continueBtn?.addEventListener('click', () => {
        if (userData.services.length === 0) {
            alert('Please select at least one service');
            return;
        }
        loadPage('onboarding-location');
    });
}

// Step 4: Location
if (window.location.href.includes('onboarding-location')) {
    const continueBtn = document.getElementById('location-continue');
    const useLocationBtn = document.getElementById('use-current-location');
    
    // Load Leaflet map
    const script = document.createElement('script');
    script.src = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.js';
    script.onload = () => {
        const link = document.createElement('link');
        link.rel = 'stylesheet';
        link.href = 'https://unpkg.com/leaflet@1.9.4/dist/leaflet.css';
        document.head.appendChild(link);
        
        let map = L.map('map').setView([6.5244, 3.3792], 13); // Default: Lagos
        L.tileLayer('https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png', {
            attribution: '© OpenStreetMap'
        }).addTo(map);
        
        let marker = L.marker([6.5244, 3.3792]).addTo(map);
        
        map.on('click', (e) => {
            marker.setLatLng(e.latlng);
            userData.location = { lat: e.latlng.lat, lng: e.latlng.lng };
        });
        
        useLocationBtn?.addEventListener('click', () => {
            if (navigator.geolocation) {
                navigator.geolocation.getCurrentPosition((pos) => {
                    const { latitude, longitude } = pos.coords;
                    map.setView([latitude, longitude], 14);
                    marker.setLatLng([latitude, longitude]);
                    userData.location = { lat: latitude, lng: longitude };
                }, () => {
                    alert('Could not get location. Please tap on map to set manually.');
                });
            } else {
                alert('Geolocation not supported. Please tap on map.');
            }
        });
    };
    document.head.appendChild(script);
    
    continueBtn?.addEventListener('click', async () => {
        if (!userData.location) {
            alert('Please set your location by tapping on the map or using current location');
            return;
        }
        
        // Save all user data to Firestore
        try {
            const userId = currentUser.uid;
            await window.firebaseDb.collection('users').doc(userId).set({
                displayName: userData.displayName,
                phoneNumber: userData.phoneNumber,
                services: userData.services,
                location: userData.location,
                profilePicture: userData.profilePicture || null,
                createdAt: new Date(),
                credits: 6,
                rating: 0,
                totalGigs: 0
            });
            
            loadPage('onboarding-credits');
        } catch (error) {
            console.error('Save error:', error);
            alert('Error saving data. Please try again.');
        }
    });
}

// Step 5: Credits
if (window.location.href.includes('onboarding-credits')) {
    document.getElementById('credits-continue')?.addEventListener('click', () => {
        loadPage('home');
    });
}
