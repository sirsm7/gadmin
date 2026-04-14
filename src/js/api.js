/**
 * @file api.js
 * @description Network layer handling all external communications.
 * Enforces Strict Separation of Concerns: No DOM manipulation occurs here.
 * Interfaces with Google Apps Script (Execution) and Supabase (Caching).
 */

// Konfigurasi Endpoint Utama
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzt9R_Ag4sPSDAWLSHEOPCGQjKtZqZCj6M8eGNy_PqgGeplWOaljNU0qQi_oQ55syks/exec";

// Konfigurasi Supabase (Merujuk kepada persekitaran DEV NADIM)
const SUPABASE_URL = "https://app.tech4ag.my";
const SUPABASE_ANON_KEY = "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJyb2xlIjoiYW5vbiIsImlzcyI6InN1cGFiYXNlIiwiaWF0IjoxNzYzMzczNjQ1LCJleHAiOjIwNzg3MzM2NDV9.vZOedqJzUn01PjwfaQp7VvRzSm4aRMr21QblPDK8AoY";

// Permulaan (Initialization) Client Supabase dari CDN Global 'window'
const supabase = window.supabase.createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

/**
 * Generic helper to handle POST requests to Google Apps Script.
 * Uses text/plain to bypass strict pre-flight CORS issues natively on GAS.
 * @param {Object} payload - The JSON payload to send.
 * @returns {Promise<Object>} The parsed JSON response from GAS.
 */
async function callGASBackend(payload) {
    try {
        const response = await fetch(GAS_WEB_APP_URL, {
            method: "POST",
            headers: {
                "Content-Type": "text/plain;charset=utf-8",
            },
            body: JSON.stringify(payload),
            redirect: "follow"
        });

        if (!response.ok) {
            throw new Error(`Ralat HTTP pelayan: ${response.status}`);
        }

        const data = await response.json();
        return data;
    } catch (error) {
        console.error("Ralat komunikasi GAS:", error);
        throw error;
    }
}

/**
 * Executes the bulk OU transfer via Google Apps Script.
 * @param {string} targetOU - The destination Organizational Unit path.
 * @param {Array<string>} emails - Array of clean user emails.
 * @returns {Promise<Object>} Response containing execution metrics and logs.
 */
export async function executeTransfer(targetOU, emails) {
    const payload = {
        action: "transfer",
        targetOU: targetOU,
        emails: emails
    };

    const response = await callGASBackend(payload);
    
    if (response.status === "error") {
        throw new Error(response.message);
    }
    
    return response.data;
}

/**
 * Fetches fresh OUs directly from Google Admin Directory via GAS.
 * @returns {Promise<Array<string>>} Array of raw OU paths.
 */
export async function fetchFreshOUsFromAdmin() {
    const payload = {
        action: "refresh_ous"
    };

    const response = await callGASBackend(payload);
    
    if (response.status === "error") {
        throw new Error(response.message);
    }
    
    return response.data.ouList;
}

/**
 * Fetches cached OU paths and joins them with existing NADIM school tables.
 * Emulates the previous structure by creating a 'kodList' mapping internally.
 * @returns {Promise<Object>} Object containing { ouList: [], kodList: [] }
 */
export async function getCachedDataFromSupabase() {
    try {
        // Run all 3 fetches concurrently to maximize speed
        const [ouResponse, smpidResponse, delimaResponse] = await Promise.all([
            supabase.from('gadmin_senarai_ou').select('org_unit_path').order('org_unit_path', { ascending: true }),
            supabase.from('smpid_sekolah_data').select('kod_sekolah, nama_sekolah'),
            supabase.from('delima_data_sekolah').select('kod_sekolah, kod_ou')
        ]);

        // Error checking for each query
        if (ouResponse.error) throw new Error("Gagal menarik data OU: " + ouResponse.error.message);
        if (smpidResponse.error) throw new Error("Gagal menarik data SMPID: " + smpidResponse.error.message);
        if (delimaResponse.error) throw new Error("Gagal menarik data DELIMA: " + delimaResponse.error.message);

        // Map SMPID names for fast lookup
        const smpidNameMap = {};
        if (smpidResponse.data) {
            smpidResponse.data.forEach(school => {
                if(school.kod_sekolah) {
                    smpidNameMap[school.kod_sekolah.trim()] = school.nama_sekolah;
                }
            });
        }

        // Construct the virtual 'kodList' format expected by app.js
        const constructedKodList = [];
        if (delimaResponse.data) {
            delimaResponse.data.forEach(item => {
                if (item.kod_sekolah && item.kod_ou) {
                    const kodSek = item.kod_sekolah.trim();
                    constructedKodList.push({
                        kod_sekolah: kodSek,
                        nama_sekolah: smpidNameMap[kodSek] || "NAMA SEKOLAH TIDAK DIJUMPAI",
                        kod_ou: item.kod_ou.trim()
                    });
                }
            });
        }

        // Return the exact same signature that app.js expects
        return {
            ouList: ouResponse.data.map(item => item.org_unit_path),
            kodList: constructedKodList
        };

    } catch (error) {
        console.error("Ralat cantuman pangkalan data Supabase:", error);
        throw error;
    }
}

/**
 * Updates the Supabase cache with fresh OUs fetched from Google Admin.
 * @param {Array<string>} freshOuPaths - The latest OU paths from Admin SDK.
 * @returns {Promise<void>}
 */
export async function syncOUsToSupabase(freshOuPaths) {
    try {
        const payload = freshOuPaths.map(path => ({
            org_unit_path: path
        }));

        const { error } = await supabase
            .from('gadmin_senarai_ou')
            .upsert(payload, { onConflict: 'org_unit_path' });

        if (error) {
            throw new Error("Gagal menyegerak OU ke Supabase: " + error.message);
        }
        
    } catch (error) {
        console.error("Ralat penyegerakan Supabase:", error);
        throw error;
    }
}