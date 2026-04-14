/**
 * @file api.js
 * @description Network layer handling all external communications.
 * Enforces Strict Separation of Concerns: No DOM manipulation occurs here.
 * Interfaces with Google Apps Script (Execution) and Supabase (Caching).
 */

// Konfigurasi Endpoint Utama
const GAS_WEB_APP_URL = "https://script.google.com/macros/s/AKfycbzt9R_Ag4sPSDAWLSHEOPCGQjKtZqZCj6M8eGNy_PqgGeplWOaljNU0qQi_oQ55syks/exec";

// Konfigurasi Supabase (Sila kemaskini dengan maklumat sebenar anda)
const SUPABASE_URL = "SILA_MASUKKAN_URL_SUPABASE_ANDA_DI_SINI";
const SUPABASE_ANON_KEY = "SILA_MASUKKAN_ANON_KEY_SUPABASE_ANDA_DI_SINI";

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
                // Using text/plain prevents complex CORS preflight issues with GAS
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
    
    // Validate if the internal GAS routing threw an error
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
 * Fetches cached OU paths and School Codes mapping from Supabase.
 * Does not require Auth because RLS is disabled on these specific tables.
 * @returns {Promise<Object>} Object containing both arrays.
 */
export async function getCachedDataFromSupabase() {
    try {
        // Run both fetches concurrently for maximum performance
        const [ouResponse, kodResponse] = await Promise.all([
            supabase.from('gadmin_senarai_ou').select('org_unit_path').order('org_unit_path', { ascending: true }),
            supabase.from('gadmin_senarai_kod').select('kod_sekolah, nama_sekolah, kod_ou')
        ]);

        if (ouResponse.error) throw new Error("Gagal menarik data OU dari Supabase: " + ouResponse.error.message);
        if (kodResponse.error) throw new Error("Gagal menarik Kod Sekolah dari Supabase: " + kodResponse.error.message);

        return {
            ouList: ouResponse.data.map(item => item.org_unit_path),
            kodList: kodResponse.data
        };
    } catch (error) {
        console.error("Ralat pangkalan data Supabase:", error);
        throw error;
    }
}

/**
 * Updates the Supabase cache with fresh OUs fetched from Google Admin.
 * Handles the logic of syncing the remote database.
 * @param {Array<string>} freshOuPaths - The latest OU paths from Admin SDK.
 * @returns {Promise<void>}
 */
export async function syncOUsToSupabase(freshOuPaths) {
    try {
        // Prepare payload for Supabase insertion
        const payload = freshOuPaths.map(path => ({
            org_unit_path: path
        }));

        // Upsert operation to update existing or insert new without causing UNIQUE constraint errors.
        // Assumes org_unit_path is a UNIQUE constraint in the database.
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