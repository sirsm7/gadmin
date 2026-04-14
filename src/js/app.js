/**
 * @file app.js
 * @description Main application controller.
 * Enforces Strict Separation of Concerns: Connects UI manipulations with API network calls.
 * Implements business logic for data mapping, event listeners, and execution flow.
 * Now manages globalSchoolDict for backend email notifications.
 */

import * as api from './api.js';
import * as ui from './ui.js';

// Constant based on the original system requirements
const OFF_OU_PATH = "/JPN/MELAKA/OFF";

// Global state to hold school name mappings for backend email notifications
let globalSchoolDict = {};

/**
 * Main Initialization sequence executed when the DOM is fully loaded.
 */
document.addEventListener('DOMContentLoaded', async () => {
    // 1. Initialize DOM cache in UI layer
    ui.initDOM();
    
    // 2. Setup Event Listeners
    setupEventListeners();

    // 3. Perform initial data load from Supabase Cache
    await loadInitialData();
});

/**
 * Attaches event listeners to the DOM elements.
 */
function setupEventListeners() {
    const DOM = ui.getDOMElements();

    // Email Input: Track number of lines (emails)
    DOM.emailInput.addEventListener('input', (e) => {
        const rawText = e.target.value;
        const count = extractValidEmails(rawText).length;
        ui.updateEmailCount(count);
    });

    // Clear Emails Button
    DOM.btnClearEmails.addEventListener('click', () => {
        ui.clearEmailInput();
    });

    // Refresh OUs from Admin Button
    DOM.btnRefreshOU.addEventListener('click', handleRefreshOUs);

    // Main Transfer Execution Button
    DOM.btnTransfer.addEventListener('click', handleTransferExecution);
}

/**
 * Loads cached OU and School Code data from Supabase on startup.
 */
async function loadInitialData() {
    ui.setSystemStatus('Memuatkan Pangkalan Data...', 'loading');
    
    try {
        // Fetch raw data arrays from Supabase via API layer
        const data = await api.getCachedDataFromSupabase();
        
        // Process and map the raw data into UI-friendly format
        // This also populates the globalSchoolDict for email notifications
        const formattedList = mapDataForUI(data.ouList, data.kodList);
        
        // Push to UI layer
        ui.populateOUList(formattedList);
        ui.setSystemStatus('Sistem Sedia', 'ready');
        
    } catch (error) {
        console.error(error);
        ui.setSystemStatus('Ralat Pangkalan Data', 'error');
        alert("Gagal memuatkan data awal: " + error.message);
    }
}

/**
 * Core Business Logic: Maps raw OU paths with School Codes to create user-friendly dropdown options.
 * Populates globalSchoolDict for use in backend email notifications.
 * @param {Array<string>} ouList - Raw OrgUnitPath array.
 * @param {Array<Object>} kodList - Array of mapped school objects from Supabase.
 * @returns {Array<Object>} Array of objects { text: "Display Text", value: "Exact Path" }
 */
function mapDataForUI(ouList, kodList) {
    const codeMap = {};
    
    // 1. Build a fast lookup dictionary for School Codes
    if (kodList && kodList.length > 0) {
        kodList.forEach(row => {
            if (row.kod_ou) {
                // Example mapping: "5356" -> "MBA0001 - SEKOLAH KEBANGSAAN MASJID TANAH"
                codeMap[row.kod_ou.toString().trim()] = `${row.kod_sekolah} - ${row.nama_sekolah}`;
            }
        });
    }

    // Assign to global state to be used during transfer execution
    globalSchoolDict = codeMap;

    const finalOUList = [];

    // 2. Inject the OFF group at the very top (Priority)
    finalOUList.push({
        text: "♻️ KUMPULAN OFF (Bersara/Berhenti/Pindah)",
        value: OFF_OU_PATH
    });

    // 3. Process and format the rest of the OUs
    ouList.forEach(path => {
        // Skip if it's the OFF path (already handled above)
        if (path === OFF_OU_PATH) return;

        let displayText = path; // Default display is the raw path
        
        // Attempt to extract the number from the path (e.g., ".../SEKOLAH-5356" -> "5356")
        const match = path.match(/SEKOLAH-(\d+)$/i);
        if (match && match[1]) {
            const extractedCode = match[1];
            // Check if we have a mapping for this code in our dictionary
            if (codeMap[extractedCode]) {
                 displayText = `${codeMap[extractedCode]} (${path})`;
            }
        }

        finalOUList.push({
            text: displayText,
            value: path
        });
    });

    return finalOUList;
}

/**
 * Handles the "Segerak Admin" logic.
 * Connects to Google Admin SDK via GAS Web App, then updates Supabase, then refreshes UI.
 */
async function handleRefreshOUs() {
    ui.setRefreshLoadingState(true);
    ui.setSystemStatus('Menarik Direktori GWS...', 'loading');
    
    try {
        // 1. Fetch fresh paths directly from Google Workspace Admin Directory
        const freshOUs = await api.fetchFreshOUsFromAdmin();
        
        // 2. Sync these new paths into our Supabase Cache
        ui.setSystemStatus('Menyegerak Supabase...', 'loading');
        await api.syncOUsToSupabase(freshOUs);
        
        // 3. Reload the UI by fetching the merged data again
        await loadInitialData();
        
        alert(`Berjaya menyegerak ${freshOUs.length} OU terkini dari Google Admin.`);
        
    } catch (error) {
        console.error(error);
        ui.setSystemStatus('Gagal Menyegerak', 'error');
        alert("Ralat penyegerakan: " + error.message);
    } finally {
        ui.setRefreshLoadingState(false);
    }
}

/**
 * Handles the main execution process for transferring users.
 */
async function handleTransferExecution() {
    // 1. Input Extraction & Basic Validation
    const rawEmailsText = ui.getRawEmails();
    const emails = extractValidEmails(rawEmailsText);
    
    if (emails.length === 0) {
        alert("Sila masukkan sekurang-kurangnya satu alamat emel yang sah.");
        return;
    }

    const selectedInputText = ui.getSelectedOUText().trim();
    if (!selectedInputText) {
        alert("Sila cari dan pilih Destinasi OU dari senarai terlebih dahulu.");
        return;
    }

    // 2. Map visual text back to Exact Backend Path
    let exactOUPath = selectedInputText; // Fallback
    const options = ui.getOUDataListOptions();
    
    for (let i = 0; i < options.length; i++) {
        if (options[i].value === selectedInputText) {
            exactOUPath = options[i].getAttribute('data-ou-path');
            break;
        }
    }

    // 3. Confirm execution with the user
    const confirmMsg = `PENGESAHAN PEMINDAHAN PUKAL\n\nJumlah Pengguna: ${emails.length}\nDestinasi: ${exactOUPath}\n\nTeruskan operasi ini?`;
    if (!confirm(confirmMsg)) return;

    // 4. Execution Initialization
    ui.setTransferLoadingState(true);
    ui.resetLogs();
    
    try {
        // 5. Send to GAS Backend via API Layer (Passing globalSchoolDict for emails)
        const result = await api.executeTransfer(exactOUPath, emails, globalSchoolDict);
        
        // 6. Process Results and Render to UI
        ui.updateLogCounters(result.successCount, result.errorCount);
        
        if (result.logs && result.logs.length > 0) {
            result.logs.forEach(log => {
                const isError = log.status === "Gagal";
                ui.renderLogItem(log, isError);
            });
        } else {
            ui.renderLogItem({ email: "Sistem", status: "Makluman", reason: "Tiada data diproses." }, false);
        }

    } catch (error) {
        // Handle critical network or server routing errors
        console.error(error);
        ui.renderLogItem({
            email: "Ralat Pelayan / Rangkaian",
            status: "Gagal",
            reason: error.message || "Terdapat ralat ketika berhubung dengan pelayan Google Apps Script."
        }, true);
    } finally {
        ui.setTransferLoadingState(false);
    }
}

/**
 * Utility function to clean up the raw textarea input into a valid array of emails.
 * @param {string} rawText - The multiline string from textarea.
 * @returns {Array<string>} Clean array of non-empty email strings.
 */
function extractValidEmails(rawText) {
    if (!rawText) return [];
    return rawText.split('\n')
        .map(email => email.trim())
        .filter(email => email !== ""); // Remove empty lines
}