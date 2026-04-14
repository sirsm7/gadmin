/**
 * @file ui.js
 * @description UI/DOM manipulation layer.
 * Enforces Strict Separation of Concerns: No network calls or business logic.
 * Exposes methods to update button states, populate datalists, and render logs.
 */

// Cache objek DOM untuk pengaksesan pantas
const DOM = {};

/**
 * Initializes DOM element references. Must be called after DOMContentLoaded.
 */
export function initDOM() {
    DOM.systemStatusBadge = document.getElementById('systemStatusBadge');
    
    DOM.emailInput = document.getElementById('emailInput');
    DOM.emailCountDisplay = document.getElementById('emailCountDisplay');
    DOM.btnClearEmails = document.getElementById('btnClearEmails');
    
    DOM.ouSearchInput = document.getElementById('ouSearchInput');
    DOM.ouDataList = document.getElementById('ouDataList');
    DOM.btnRefreshOU = document.getElementById('btnRefreshOU');
    DOM.iconRefresh = document.getElementById('iconRefresh');
    DOM.iconRefreshSpin = document.getElementById('iconRefreshSpin');
    
    DOM.btnTransfer = document.getElementById('btnTransfer');
    DOM.iconTransfer = document.getElementById('iconTransfer');
    DOM.iconTransferSpin = document.getElementById('iconTransferSpin');
    DOM.btnTextTransfer = document.getElementById('btnTextTransfer');
    
    DOM.countSuccess = document.getElementById('countSuccess');
    DOM.countError = document.getElementById('countError');
    DOM.logContainer = document.getElementById('logContainer');
    DOM.logPlaceholder = document.getElementById('logPlaceholder');
}

/**
 * Updates the global system status badge in the header.
 * @param {string} text - The text to display.
 * @param {string} state - 'loading', 'ready', or 'error'.
 */
export function setSystemStatus(text, state) {
    DOM.systemStatusBadge.textContent = text;
    DOM.systemStatusBadge.className = 'font-semibold text-xs'; // Reset classes
    
    if (state === 'loading') {
        DOM.systemStatusBadge.classList.add('text-yellow-400');
    } else if (state === 'ready') {
        DOM.systemStatusBadge.classList.add('text-green-400');
    } else if (state === 'error') {
        DOM.systemStatusBadge.classList.add('text-red-400');
    }
}

/**
 * Populates the <datalist> with formatted OU options.
 * @param {Array<Object>} formattedOUs - Array of objects { text: "Display", value: "Path" }
 */
export function populateOUList(formattedOUs) {
    DOM.ouDataList.innerHTML = ''; // Clear existing
    
    if (formattedOUs.length === 0) {
        DOM.ouSearchInput.placeholder = "Tiada data OU. Sila Segerak Admin.";
        DOM.ouSearchInput.disabled = true;
        return;
    }

    formattedOUs.forEach(ou => {
        const option = document.createElement('option');
        option.value = ou.text;
        // Simpan laluan sebenar (path) di dalam attribute data untuk rujukan backend
        option.setAttribute('data-ou-path', ou.value);
        DOM.ouDataList.appendChild(option);
    });

    DOM.ouSearchInput.disabled = false;
    DOM.ouSearchInput.placeholder = "Cari Kod, Nama Sekolah atau OFF...";
}

/**
 * Toggles the loading state of the Sync (Refresh OU) button.
 * @param {boolean} isLoading 
 */
export function setRefreshLoadingState(isLoading) {
    if (isLoading) {
        DOM.btnRefreshOU.disabled = true;
        DOM.iconRefresh.classList.add('hidden');
        DOM.iconRefreshSpin.classList.remove('hidden');
        DOM.ouSearchInput.disabled = true;
        DOM.ouSearchInput.value = '';
        DOM.ouSearchInput.placeholder = "Sedang menarik data...";
    } else {
        DOM.btnRefreshOU.disabled = false;
        DOM.iconRefresh.classList.remove('hidden');
        DOM.iconRefreshSpin.classList.add('hidden');
        DOM.ouSearchInput.disabled = false;
    }
}

/**
 * Toggles the loading state of the main Transfer button.
 * @param {boolean} isLoading 
 */
export function setTransferLoadingState(isLoading) {
    if (isLoading) {
        DOM.btnTransfer.disabled = true;
        DOM.iconTransfer.classList.add('hidden');
        DOM.iconTransferSpin.classList.remove('hidden');
        DOM.btnTextTransfer.textContent = "Sedang Memproses...";
        
        // Disable other inputs during execution
        DOM.emailInput.disabled = true;
        DOM.ouSearchInput.disabled = true;
        DOM.btnRefreshOU.disabled = true;
        DOM.btnClearEmails.disabled = true;
    } else {
        DOM.btnTransfer.disabled = false;
        DOM.iconTransfer.classList.remove('hidden');
        DOM.iconTransferSpin.classList.add('hidden');
        DOM.btnTextTransfer.textContent = "Laksanakan Pemindahan OU Pukal";
        
        // Re-enable inputs
        DOM.emailInput.disabled = false;
        DOM.ouSearchInput.disabled = false;
        DOM.btnRefreshOU.disabled = false;
        DOM.btnClearEmails.disabled = false;
    }
}

/**
 * Updates the email count display based on textarea input.
 * @param {number} count 
 */
export function updateEmailCount(count) {
    DOM.emailCountDisplay.textContent = `${count} baris`;
    if (count > 0) {
        DOM.emailCountDisplay.classList.add('text-blue-600', 'font-bold');
        DOM.emailCountDisplay.classList.remove('text-slate-500');
    } else {
        DOM.emailCountDisplay.classList.add('text-slate-500');
        DOM.emailCountDisplay.classList.remove('text-blue-600', 'font-bold');
    }
}

/**
 * Clears the execution logs container and counters.
 */
export function resetLogs() {
    DOM.logContainer.innerHTML = '';
    DOM.countSuccess.textContent = '0';
    DOM.countError.textContent = '0';
}

/**
 * Updates the summary counters for execution logs.
 */
export function updateLogCounters(successCount, errorCount) {
    DOM.countSuccess.textContent = successCount;
    DOM.countError.textContent = errorCount;
}

/**
 * Renders a single log entry into the log container.
 * @param {Object} log - { email: string, status: string, reason: string }
 * @param {boolean} isError - Determine styling
 */
export function renderLogItem(log, isError) {
    // Buang placeholder jika ada
    if (document.getElementById('logPlaceholder')) {
        DOM.logContainer.innerHTML = '';
    }

    const borderColor = isError ? 'border-red-500' : 'border-green-500';
    const statusColor = isError ? 'text-red-600' : 'text-green-600';
    const icon = isError ? '<i class="ph ph-x-circle mr-1"></i>' : '<i class="ph ph-check-circle mr-1"></i>';
    const bgClass = isError ? 'bg-red-50' : 'bg-white';

    const logHTML = `
        <div class="border-l-4 ${borderColor} ${bgClass} p-3 rounded shadow-sm border border-slate-100 mb-2">
            <div class="flex justify-between items-start">
                <span class="font-semibold text-slate-800 break-all text-xs">${log.email}</span>
                <span class="${statusColor} font-bold text-[10px] uppercase tracking-wider ml-2 flex items-center whitespace-nowrap">
                    ${icon} ${log.status}
                </span>
            </div>
            <div class="text-slate-500 text-[11px] mt-1 leading-tight">${log.reason}</div>
        </div>
    `;
    
    DOM.logContainer.insertAdjacentHTML('beforeend', logHTML);
    // Auto-scroll ke bawah
    DOM.logContainer.scrollTop = DOM.logContainer.scrollHeight;
}

/**
 * Getters for UI Input Values (to be used by app.js)
 */
export function getRawEmails() { return DOM.emailInput.value; }
export function getSelectedOUText() { return DOM.ouSearchInput.value; }
export function getOUDataListOptions() { return DOM.ouDataList.options; }
export function clearEmailInput() { DOM.emailInput.value = ''; updateEmailCount(0); }
export function getDOMElements() { return DOM; } // Pass references to app for event listeners