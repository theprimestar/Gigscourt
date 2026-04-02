// ========================================
// GigsCourt Paystack Integration
// Wallet Top-up + Credit System
// ========================================

// 🔴 REPLACE WITH YOUR ACTUAL PAYSTACK PUBLIC KEY 🔴
// Go to: Paystack Dashboard → Settings → API Keys & Webhooks
const PAYSTACK_PUBLIC_KEY = "pk_live_YOUR_KEY_HERE";
// For testing use: "pk_test_4f6ae42964ab8da60e2f1c77cfb6fe1cd30806cc"
// 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴 🔴

// Credit packages (price in NGN, credits received)
const CREDIT_PACKAGES = [
    { ngn: 500, credits: 10, label: "₦500 - 10 Credits" },
    { ngn: 1000, credits: 25, label: "₦1,000 - 25 Credits (+2 free)" },
    { ngn: 2000, credits: 55, label: "₦2,000 - 55 Credits (+5 free)" },
    { ngn: 5000, credits: 150, label: "₦5,000 - 150 Credits (+20 free)" }
];

// ===== Initialize Paystack Payment =====
function initializePayment(email, amount, credits, onSuccess, onCancel) {
    const handler = PaystackPop.setup({
        key: PAYSTACK_PUBLIC_KEY,
        email: email,
        amount: amount * 100, // Paystack uses kobo (multiply by 100)
        currency: "NGN",
        ref: "GIGS_" + Date.now() + "_" + Math.random().toString(36).substr(2, 8),
        metadata: {
            custom_fields: [
                {
                    display_name: "Credits",
                    variable_name: "credits",
                    value: credits.toString()
                },
                {
                    display_name: "Plan",
                    variable_name: "plan",
                    value: "wallet_topup"
                }
            ]
        },
        callback: function(response) {
            // Payment successful
            onSuccess({
                reference: response.reference,
                amount: amount,
                credits: credits,
                transactionId: response.transaction
            });
        },
        onClose: function() {
            // User closed modal
            if (onCancel) onCancel();
        }
    });
    
    handler.openIframe();
}

// ===== Process Top-up After Payment =====
async function processTopUp(userId, paymentData) {
    // Verify transaction on your backend (recommended)
    // For MVP, we'll add credits directly
    
    const { amount, credits, reference } = paymentData;
    
    // Add credits to user's wallet
    const currentCredits = await window.Supabase.getCredits(userId);
    const newCredits = currentCredits + credits;
    
    // Update profile
    const { error } = await window.Supabase.client
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', userId);
    
    if (error) throw error;
    
    // Log transaction
    await window.Supabase.client
        .from('transactions')
        .insert({
            user_id: userId,
            amount: amount,
            type: 'credit',
            description: `Wallet top-up: ${credits} credits (Ref: ${reference})`
        });
    
    return { success: true, newCredits, creditsAdded: credits };
}

// ===== Check if User Can Perform Action (costs credits) =====
async function canPerformAction(userId, actionType = "message") {
    const credits = await window.Supabase.getCredits(userId);
    
    const actionCosts = {
        message: 1,      // 1 credit per message
        register_gig: 2, // 2 credits to register a gig
        call: 0          // Call is free (uses SIM dialer)
    };
    
    const cost = actionCosts[actionType] || 1;
    return { allowed: credits >= cost, credits, cost };
}

// ===== Deduct Credits for Action =====
async function deductForAction(userId, actionType = "message") {
    const { allowed, credits, cost } = await canPerformAction(userId, actionType);
    
    if (!allowed) {
        throw new Error(`Insufficient credits. You have ${credits}, need ${cost}`);
    }
    
    const newCredits = credits - cost;
    
    const { error } = await window.Supabase.client
        .from('profiles')
        .update({ credits: newCredits })
        .eq('id', userId);
    
    if (error) throw error;
    
    // Log debit transaction
    await window.Supabase.client
        .from('transactions')
        .insert({
            user_id: userId,
            amount: cost,
            type: 'debit',
            description: `${actionType} cost`
        });
    
    return { success: true, newCredits, cost };
}

// ===== Get Available Credit Packages =====
function getCreditPackages() {
    return CREDIT_PACKAGES;
}

// ===== Show Top-up Modal =====
function showTopUpModal(userEmail, userId) {
    const modalContainer = document.getElementById("modal-container");
    if (!modalContainer) return;
    
    // Create packages HTML
    const packagesHtml = CREDIT_PACKAGES.map(pkg => `
        <div class="credit-package" data-amount="${pkg.ngn}" data-credits="${pkg.credits}" style="
            background: var(--bg-secondary);
            border-radius: 16px;
            padding: 16px;
            margin-bottom: 12px;
            cursor: pointer;
            transition: all 0.2s ease;
            text-align: center;
        ">
            <div style="font-weight: 600; font-size: 18px; color: var(--accent-burnt-orange);">${pkg.label}</div>
            <div style="font-size: 12px; color: var(--text-secondary); margin-top: 4px;">
                ${pkg.credits} credits for ₦${pkg.ngn.toLocaleString()}
            </div>
        </div>
    `).join("");
    
    const modal = document.createElement("div");
    modal.className = "modal-overlay";
    modal.innerHTML = `
        <div class="bottom-sheet" style="max-width: 400px; margin: auto;">
            <h3 style="font-size: 24px; margin-bottom: 8px;">Top Up Wallet</h3>
            <p style="color: var(--text-secondary); margin-bottom: 24px;">Choose a credit package</p>
            
            <div id="packages-list">
                ${packagesHtml}
            </div>
            
            <div style="margin-top: 24px; text-align: center;">
                <button class="btn-burnt-orange" id="close-topup-modal" style="background: transparent; color: var(--text-secondary); box-shadow: none;">
                    Cancel
                </button>
            </div>
        </div>
    `;
    
    modalContainer.appendChild(modal);
    
    // Add event listeners to packages
    document.querySelectorAll(".credit-package").forEach(pkg => {
        pkg.addEventListener("click", () => {
            const amount = parseInt(pkg.dataset.amount);
            const credits = parseInt(pkg.dataset.credits);
            
            initializePayment(
                userEmail,
                amount,
                credits,
                async (paymentResponse) => {
                    // Payment success
                    try {
                        const result = await processTopUp(userId, {
                            amount: amount,
                            credits: credits,
                            reference: paymentResponse.reference
                        });
                        
                        // Close modal
                        modal.remove();
                        
                        // Show success message
                        alert(`✅ Success! ${result.creditsAdded} credits added. Total: ${result.newCredits} credits`);
                        
                        // Refresh profile display if on profile page
                        if (window.refreshWalletDisplay) {
                            window.refreshWalletDisplay();
                        }
                        
                        // Trigger confetti
                        if (window.canvasConfetti) {
                            window.canvasConfetti({
                                particleCount: 100,
                                spread: 70,
                                origin: { y: 0.6 },
                                colors: ['#d35400', '#e03a3a']
                            });
                        }
                    } catch (error) {
                        alert("Error processing top-up: " + error.message);
                    }
                },
                () => {
                    // User cancelled
                    console.log("Payment cancelled");
                }
            );
        });
    });
    
    document.getElementById("close-topup-modal")?.addEventListener("click", () => {
        modal.remove();
    });
}

// ===== Display Credits in UI =====
function createWalletDisplay(credits, onTopUpClick) {
    const container = document.createElement("div");
    container.className = "wallet-display";
    container.style.cssText = `
        background: var(--bg-glass);
        backdrop-filter: blur(10px);
        border-radius: 60px;
        padding: 8px 16px;
        display: inline-flex;
        align-items: center;
        gap: 12px;
    `;
    
    container.innerHTML = `
        <i class="fas fa-coins" style="color: var(--accent-burnt-orange);"></i>
        <span style="font-weight: 600;">${credits} Credits</span>
        <button class="top-up-btn" style="
            background: var(--accent-burnt-orange);
            border: none;
            border-radius: 40px;
            padding: 4px 12px;
            color: white;
            font-size: 12px;
            font-weight: 600;
            cursor: pointer;
        ">Top Up</button>
    `;
    
    container.querySelector(".top-up-btn")?.addEventListener("click", onTopUpClick);
    
    return container;
}

// Export to global
window.Paystack = {
    publicKey: PAYSTACK_PUBLIC_KEY,
    creditPackages: CREDIT_PACKAGES,
    initializePayment,
    processTopUp,
    canPerformAction,
    deductForAction,
    getCreditPackages,
    showTopUpModal,
    createWalletDisplay
};
