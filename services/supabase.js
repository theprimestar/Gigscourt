// services/supabase.js
// Supabase client initialization

// Your Supabase configuration
const SUPABASE_URL = 'https://qifzdrkpxzosdturjpex.supabase.co';
const SUPABASE_ANON_KEY = 'sb_publishable_QfKJ4jT8u_2HuUKmW-xvbQ_9acJvZw-';

// Load Supabase library from CDN
const supabaseScript = document.createElement('script');
supabaseScript.src = 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2/dist/umd/supabase.js';
supabaseScript.onload = () => {
    // Initialize Supabase client after library loads
    window.supabaseClient = supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);
    console.log('✅ Supabase client initialized');
    
    // Test connection (optional - will show error but won't break)
    window.supabaseClient.from('profiles').select('count', { count: 'exact', head: true })
        .then(result => {
            console.log('📡 Supabase connection test:', result);
        });
};
document.head.appendChild(supabaseScript);
