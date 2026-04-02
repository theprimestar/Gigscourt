// ========================================
// GigsCourt Modal & Bottom Sheet Component
// Rating Modal + Bottom Sheets + Confetti
// ========================================

const Modal = (function() {
    
    let activeModal = null;
    
    // ===== Rating Modal (1-5 stars) =====
    function showRatingModal(toUserId, gigId, onComplete) {
        closeModal();
        
        const modalContainer = document.getElementById("modal-container");
        if (!modalContainer) return;
        
        let selectedRating = 0;
        let reviewText = "";
        
        const modal = document.createElement("div");
        modal.className = "modal-overlay";
        modal.innerHTML = `
            <div class="bottom-sheet" style="max-width: 450px;">
                <h3 style="font-size: 24px; margin-bottom: 8px; text-align: center;">Rate This Gig</h3>
                <p style="color: var(--text-secondary); text-align: center; margin-bottom: 24px;">How was your experience?</p>
                
                <div class="stars-container" id="rating-stars">
                    <i class="far fa-star star" data-rating="1"></i>
                    <i class="far fa-star star" data-rating="2"></i>
                    <i class="far fa-star star" data-rating="3"></i>
                    <i class="far fa-star star" data-rating="4"></i>
                    <i class="far fa-star star" data-rating="5"></i>
                </div>
                
                <textarea id="review-text" placeholder="Write a review (optional)" style="
                    width: 100%;
                    padding: 12px;
                    border-radius: 16px;
                    border: 1px solid var(--border-glass);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-family: inherit;
                    resize: none;
                    margin: 16px 0;
                " rows="3"></textarea>
                
                <button id="submit-rating-btn" class="btn-burnt-orange" style="width: 100%;" disabled>
                    Submit Rating
                </button>
                
                <button id="close-rating-btn" style="
                    background: transparent;
                    border: none;
                    color: var(--text-secondary);
                    margin-top: 12px;
                    cursor: pointer;
                    width: 100%;
                    padding: 12px;
                ">Cancel</button>
            </div>
        `;
        
        modalContainer.appendChild(modal);
        activeModal = modal;
        
        // Star interaction
        const stars = modal.querySelectorAll(".star");
        stars.forEach(star => {
            star.addEventListener("click", () => {
                selectedRating = parseInt(star.dataset.rating);
                updateStars(stars, selectedRating);
                
                const submitBtn = modal.querySelector("#submit-rating-btn");
                if (submitBtn && selectedRating > 0) {
                    submitBtn.disabled = false;
                }
            });
        });
        
        // Review text input
        const reviewInput = modal.querySelector("#review-text");
        reviewInput.addEventListener("input", (e) => {
            reviewText = e.target.value;
        });
        
        // Submit button
        const submitBtn = modal.querySelector("#submit-rating-btn");
        submitBtn.addEventListener("click", async () => {
            if (selectedRating === 0) return;
            
            submitBtn.disabled = true;
            submitBtn.textContent = "Submitting...";
            
            try {
                const currentUser = await window.Supabase?.getCurrentUser();
                if (!currentUser) throw new Error("Please log in");
                
                await window.Supabase.submitRating(
                    currentUser.user.id,
                    toUserId,
                    gigId,
                    selectedRating,
                    reviewText
                );
                
                // Show confetti
                if (window.canvasConfetti) {
                    window.canvasConfetti({
                        particleCount: 200,
                        spread: 100,
                        origin: { y: 0.6 },
                        colors: ['#d35400', '#e03a3a', '#f5f5f0']
                    });
                }
                
                closeModal();
                if (onComplete) onComplete(selectedRating, reviewText);
                
            } catch (error) {
                alert("Error submitting rating: " + error.message);
                submitBtn.disabled = false;
                submitBtn.textContent = "Submit Rating";
            }
        });
        
        // Close button
        modal.querySelector("#close-rating-btn").addEventListener("click", closeModal);
        
        // Click outside to close
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });
    }
    
    function updateStars(stars, rating) {
        stars.forEach((star, index) => {
            const starRating = parseInt(star.dataset.rating);
            if (starRating <= rating) {
                star.className = "fas fa-star star active";
            } else {
                star.className = "far fa-star star";
            }
        });
    }
    
    // ===== Generic Bottom Sheet =====
    function showBottomSheet(title, contentHtml, options = {}) {
        closeModal();
        
        const modalContainer = document.getElementById("modal-container");
        if (!modalContainer) return;
        
        const modal = document.createElement("div");
        modal.className = "modal-overlay";
        modal.innerHTML = `
            <div class="bottom-sheet">
                ${title ? `<h3 style="font-size: 22px; margin-bottom: 16px;">${title}</h3>` : ""}
                <div id="bottom-sheet-content">${contentHtml}</div>
                ${options.showClose !== false ? `
                    <button id="close-bottom-sheet" style="
                        background: transparent;
                        border: none;
                        color: var(--text-secondary);
                        margin-top: 20px;
                        cursor: pointer;
                        width: 100%;
                        padding: 12px;
                    ">Close</button>
                ` : ""}
            </div>
        `;
        
        modalContainer.appendChild(modal);
        activeModal = modal;
        
        if (options.showClose !== false) {
            modal.querySelector("#close-bottom-sheet")?.addEventListener("click", closeModal);
        }
        
        modal.addEventListener("click", (e) => {
            if (e.target === modal && options.closeOnOutsideTap !== false) {
                closeModal();
            }
        });
        
        return modal;
    }
    
    // ===== Register Gig Modal (Gig Loop) =====
    function showRegisterGigModal(onSuccess) {
        closeModal();
        
        const modalContainer = document.getElementById("modal-container");
        if (!modalContainer) return;
        
        const modal = document.createElement("div");
        modal.className = "modal-overlay";
        modal.innerHTML = `
            <div class="bottom-sheet">
                <h3 style="font-size: 24px; margin-bottom: 8px;">Register New Gig</h3>
                <p style="color: var(--text-secondary); margin-bottom: 24px;">List your service</p>
                
                <input type="text" id="gig-title" placeholder="Title (e.g., Hair Styling)" style="
                    width: 100%;
                    padding: 14px;
                    border-radius: 16px;
                    border: 1px solid var(--border-glass);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    margin-bottom: 12px;
                ">
                
                <select id="gig-category" style="
                    width: 100%;
                    padding: 14px;
                    border-radius: 16px;
                    border: 1px solid var(--border-glass);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    margin-bottom: 12px;
                ">
                    <option value="Barber">Barber</option>
                    <option value="Tailor">Tailor</option>
                    <option value="Makeup">Makeup Artist</option>
                    <option value="Photography">Photographer</option>
                    <option value="Cleaning">Cleaning</option>
                    <option value="Other">Other</option>
                </select>
                
                <textarea id="gig-description" placeholder="Description" rows="3" style="
                    width: 100%;
                    padding: 14px;
                    border-radius: 16px;
                    border: 1px solid var(--border-glass);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    font-family: inherit;
                    margin-bottom: 12px;
                "></textarea>
                
                <input type="text" id="gig-price" placeholder="Price range (e.g., ₦5,000 - ₦15,000)" style="
                    width: 100%;
                    padding: 14px;
                    border-radius: 16px;
                    border: 1px solid var(--border-glass);
                    background: var(--bg-primary);
                    color: var(--text-primary);
                    margin-bottom: 20px;
                ">
                
                <button id="submit-gig-btn" class="btn-burnt-orange" style="width: 100%;">
                    Submit Gig (2 credits)
                </button>
                
                <button id="close-gig-modal" style="
                    background: transparent;
                    border: none;
                    color: var(--text-secondary);
                    margin-top: 12px;
                    cursor: pointer;
                    width: 100%;
                    padding: 12px;
                ">Cancel</button>
            </div>
        `;
        
        modalContainer.appendChild(modal);
        activeModal = modal;
        
        modal.querySelector("#submit-gig-btn").addEventListener("click", async () => {
            const title = modal.querySelector("#gig-title").value.trim();
            const category = modal.querySelector("#gig-category").value;
            const description = modal.querySelector("#gig-description").value.trim();
            const price_range = modal.querySelector("#gig-price").value.trim();
            
            if (!title) {
                alert("Please enter a title");
                return;
            }
            
            const btn = modal.querySelector("#submit-gig-btn");
            btn.disabled = true;
            btn.textContent = "Processing...";
            
            try {
                const currentUser = await window.Supabase?.getCurrentUser();
                if (!currentUser) throw new Error("Please log in");
                
                // Check and deduct credits
                const canDo = await window.Paystack?.canPerformAction(currentUser.user.id, "register_gig");
                if (!canDo?.allowed) {
                    throw new Error(`Insufficient credits. Need 2 credits. You have ${canDo?.credits || 0}`);
                }
                
                // Create gig
                const gig = await window.Supabase.createGig(currentUser.user.id, {
                    title,
                    category,
                    description,
                    price_range,
                    images: []
                });
                
                // Deduct credits
                await window.Paystack.deductForAction(currentUser.user.id, "register_gig");
                
                closeModal();
                
                // Trigger confetti
                if (window.canvasConfetti) {
                    window.canvasConfetti({
                        particleCount: 150,
                        spread: 70,
                        origin: { y: 0.6 },
                        colors: ['#d35400', '#e03a3a']
                    });
                }
                
                if (onSuccess) onSuccess(gig);
                alert("Gig registered successfully! 2 credits deducted.");
                
            } catch (error) {
                alert(error.message);
                btn.disabled = false;
                btn.textContent = "Submit Gig (2 credits)";
            }
        });
        
        modal.querySelector("#close-gig-modal").addEventListener("click", closeModal);
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });
    }
    
    // ===== Close Current Modal =====
    function closeModal() {
        if (activeModal) {
            activeModal.remove();
            activeModal = null;
        }
    }
    
    // ===== Alert Modal (Custom) =====
    function showAlert(title, message, onConfirm) {
        closeModal();
        
        const modalContainer = document.getElementById("modal-container");
        if (!modalContainer) return;
        
        const modal = document.createElement("div");
        modal.className = "modal-overlay";
        modal.innerHTML = `
            <div class="bottom-sheet" style="text-align: center;">
                <i class="fas fa-info-circle" style="font-size: 48px; color: var(--accent-burnt-orange); margin-bottom: 16px;"></i>
                <h3 style="font-size: 22px; margin-bottom: 8px;">${title}</h3>
                <p style="color: var(--text-secondary); margin-bottom: 24px;">${message}</p>
                <button id="alert-confirm-btn" class="btn-burnt-orange" style="width: 100%;">OK</button>
            </div>
        `;
        
        modalContainer.appendChild(modal);
        activeModal = modal;
        
        modal.querySelector("#alert-confirm-btn").addEventListener("click", () => {
            closeModal();
            if (onConfirm) onConfirm();
        });
        
        modal.addEventListener("click", (e) => {
            if (e.target === modal) closeModal();
        });
    }
    
    // Public API
    return {
        showRatingModal,
        showBottomSheet,
        showRegisterGigModal,
        showAlert,
        closeModal
    };
    
})();

// Make global
window.Modal = Modal;
