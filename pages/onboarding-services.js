// pages/onboarding-services.js
console.log('Services step loaded');

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

let selectedServices = [];

document.addEventListener('DOMContentLoaded', () => {
    const servicesContainer = document.getElementById('services-list');
    const addCustomBtn = document.getElementById('add-custom-service');
    const continueBtn = document.getElementById('services-continue');
    
    // Load saved data from previous step
    const savedData = sessionStorage.getItem('onboardingData');
    if (savedData) {
        const data = JSON.parse(savedData);
        console.log('Loaded user data:', data);
    }
    
    // Display preset services
    if (servicesContainer) {
        presetServices.forEach(service => {
            const chip = document.createElement('div');
            chip.className = 'service-chip';
            chip.textContent = service;
            chip.onclick = () => {
                chip.classList.toggle('selected');
                if (chip.classList.contains('selected')) {
                    selectedServices.push(service);
                } else {
                    selectedServices = selectedServices.filter(s => s !== service);
                }
            };
            servicesContainer.appendChild(chip);
        });
    }
    
    if (addCustomBtn) {
        addCustomBtn.addEventListener('click', () => {
            const customService = prompt('Enter your custom service:');
            if (customService && customService.trim()) {
                selectedServices.push(customService.trim());
                const chip = document.createElement('div');
                chip.className = 'service-chip selected';
                chip.textContent = customService.trim();
                chip.onclick = () => {
                    chip.remove();
                    selectedServices = selectedServices.filter(s => s !== customService.trim());
                };
                if (servicesContainer) servicesContainer.appendChild(chip);
            }
        });
    }
    
    if (continueBtn) {
        continueBtn.addEventListener('click', () => {
            if (selectedServices.length === 0) {
                alert('Please select at least one service');
                return;
            }
            
            // Save services to sessionStorage
            const existingData = sessionStorage.getItem('onboardingData');
            const userData = existingData ? JSON.parse(existingData) : {};
            userData.services = selectedServices;
            sessionStorage.setItem('onboardingData', JSON.stringify(userData));
            
            loadPage('onboarding-location');
        });
    }
});
