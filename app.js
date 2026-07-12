// =============================================
// DEFAULT PRODUCT LIST — EDIT THIS DIRECTLY
// Add, remove, or change products here anytime.
// =============================================
const DEFAULT_PRODUCTS = [];

// State
let products = [];
let lastPrices = {};
let productStats = {}; // To hold the min/max/last stats
const API_URL = 'https://script.google.com/macros/s/AKfycbyW6R_4xvbcIweewTiJ2srlryjU0mjOKetI2xwJ0Yezr5m7DKe3ncHu_-kGm-o_0vGC3Q/exec';
let isConnected = false;

// DOM Elements
const views = document.querySelectorAll('.view');
const navLinks = document.querySelectorAll('.nav-links li');
const toastEl = document.getElementById('toast');
const syncStatus = document.getElementById('sync-status');
const pageTitle = document.getElementById('page-title');
const pageSubtitle = document.getElementById('page-subtitle');

// =============================================
// JSONP Helper — Bypasses CORS completely
// =============================================
function jsonp(url) {
    return new Promise((resolve, reject) => {
        const callbackName = 'jsonp_cb_' + Date.now() + '_' + Math.floor(Math.random() * 10000);
        const separator = url.includes('?') ? '&' : '?';
        const scriptUrl = url + separator + 'callback=' + callbackName;

        const script = document.createElement('script');
        script.src = scriptUrl;

        // Timeout after 15 seconds
        const timeout = setTimeout(() => {
            cleanup();
            reject(new Error('JSONP request timed out after 15 seconds'));
        }, 15000);

        function cleanup() {
            clearTimeout(timeout);
            delete window[callbackName];
            if (script.parentNode) {
                script.parentNode.removeChild(script);
            }
        }

        window[callbackName] = (data) => {
            cleanup();
            resolve(data);
        };

        script.onerror = () => {
            cleanup();
            reject(new Error('JSONP script loading failed. Check your Apps Script URL.'));
        };

        document.head.appendChild(script);
    });
}

// =============================================
// Initialization
// =============================================
document.addEventListener('DOMContentLoaded', () => {
    // Set date from URL or default to today
    const urlParams = new URLSearchParams(window.location.search);
    const dateParam = urlParams.get('date');
    const defaultDate = dateParam || new Date().toISOString().split('T')[0];
    
    // Initialize Flatpickr for DD-MM-YYYY display but YYYY-MM-DD backend
    flatpickr("#entry-date", {
        altInput: true,
        altFormat: "d-m-Y",
        dateFormat: "Y-m-d",
        defaultDate: defaultDate,
        onChange: function(selectedDates, dateStr) {
            // Auto-trigger Go when date is picked
            window.location.href = '?date=' + dateStr;
        }
    });

    // Go button refreshes page with selected date
    const goBtn = document.getElementById('go-date-btn');
    if (goBtn) {
        goBtn.addEventListener('click', () => {
            const selectedDate = document.getElementById('entry-date').value;
            window.location.href = '?date=' + selectedDate;
        });
    }

    // Setup Navigation
    navLinks.forEach(link => {
        link.addEventListener('click', (e) => {
            const targetId = e.currentTarget.getAttribute('data-target');
            switchView(targetId);
        });
    });

    // Modals
    const addProductBtn = document.getElementById('add-product-btn');
    const productModal = document.getElementById('product-modal');
    const closeModalBtns = document.querySelectorAll('.close-modal');

    addProductBtn.addEventListener('click', () => {
        document.getElementById('product-form').reset();
        document.getElementById('prod-id').value = '';
        document.getElementById('product-modal-title').textContent = 'Add New Product';
        productModal.classList.add('active');
    });
    document.querySelector('.close-modal').addEventListener('click', () => {
        productModal.classList.remove('active');
    });
    productModal.addEventListener('mousedown', (e) => {
        if (e.target === productModal) {
            productModal.classList.remove('active');
        }
    });

    // Settings Input Setup
    const forceSyncBtn = document.getElementById('force-sync-btn');
    if (forceSyncBtn) {
        forceSyncBtn.addEventListener('click', () => {
            showToast('Fetching latest data from server...', 'info');
            checkConnection();
        });
    }

    // History View logic
    const historyDateInput = document.getElementById('history-date');
    if (historyDateInput) {
        flatpickr("#history-date", {
            altInput: true,
            altFormat: "d-m-Y",
            dateFormat: "Y-m-d",
            defaultDate: new Date().toISOString().split('T')[0],
            onChange: function(selectedDates, dateStr) {
                // Auto-fetch history when date is picked
                fetchHistoryForDate(dateStr);
            }
        });
    }
    const fetchHistoryBtn = document.getElementById('fetch-history-btn');
    if (fetchHistoryBtn) {
        fetchHistoryBtn.addEventListener('click', () => {
            if (historyDateInput) {
                fetchHistoryForDate(historyDateInput.value);
            }
        });
    }

    // Add/Edit Product Form Submit
    document.getElementById('product-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        if(!API_URL || !isConnected) {
            return showToast('Connect to Google Sheets first (Settings tab).', 'error');
        }

        const btn = e.target.querySelector('button[type="submit"]');
        btn.innerHTML = '<span class="dot" style="background:#fff"></span> Saving...';
        btn.disabled = true;

        const pId = document.getElementById('prod-id').value;

        // Auto-capitalize first letters
        const formatCase = (str) => {
            if (!str) return '';
            return str.split(' ')
                .map(word => word ? word.charAt(0).toUpperCase() + word.slice(1).toLowerCase() : '')
                .join(' ')
                .trim();
        };

        const newProduct = {
            id: pId || ('P' + Date.now()), // Unique ID fallback
            name: formatCase(document.getElementById('prod-name').value),
            category: formatCase(document.getElementById('prod-category').value),
            unit: formatCase(document.getElementById('prod-unit').value)
        };

        const action = pId ? 'edit_product' : 'add_product';

        try {
            const dataStr = encodeURIComponent(JSON.stringify(newProduct));
            const response = await jsonp(API_URL + `?action=${action}&data=` + dataStr);
            
            if (response.success) {
                if (pId) {
                    // Update existing
                    const index = products.findIndex(p => p.id === pId);
                    if (index !== -1) {
                        products[index] = response.data;
                    }
                    showToast('Product updated!', 'success');
                } else {
                    // Add new
                    products.push(response.data);
                    showToast('Product added!', 'success');
                }
                // Keep list sorted
                products.sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}));
                
                const searchTerm = document.getElementById('product-search').value.toLowerCase();
                renderProductsList(searchTerm);
                renderDailyEntryForm();
                updateDatalists();
                
                // ONLY CLOSE ON SUCCESS
                productModal.classList.remove('active');
                e.target.reset();
                document.getElementById('prod-id').value = '';
            } else {
                showToast('Failed: ' + response.error, 'error');
            }
        } catch (error) {
            showToast('Error saving product: ' + error.message, 'error');
        }

        btn.textContent = 'Save Product';
        btn.disabled = false;
    });

    // Add/Edit Product Form: Enter key advances to next field
    const productFormInputs = ['prod-name', 'prod-category', 'prod-unit'];
    productFormInputs.forEach((inputId, index) => {
        const el = document.getElementById(inputId);
        if (el) {
            el.addEventListener('keydown', (e) => {
                if (e.key === 'Enter') {
                    e.preventDefault();
                    if (index < productFormInputs.length - 1) {
                        document.getElementById(productFormInputs[index + 1]).focus();
                    } else {
                        // Last field -> submit the form
                        document.getElementById('product-form').requestSubmit();
                    }
                }
            });
        }
    });

    // Daily Entry Save
    document.getElementById('save-daily-btn').addEventListener('click', async (e) => {
        if(!API_URL || !isConnected) {
            return showToast('Connect to Google Sheets first (Settings tab).', 'error');
        }
        
        const qtyInputs = document.querySelectorAll('.qty-input');
        const items = [];
        let hasData = false;

        qtyInputs.forEach(input => {
            const row = input.closest('tr');
            const id = input.getAttribute('data-id');
            const name = input.getAttribute('data-name');
            const qty = parseFloat(input.value);
            const total = parseFloat(row.querySelector('.total-input').value);

            if(!isNaN(qty) && !isNaN(total) && qty > 0 && total > 0) {
                hasData = true;
                const rate = parseFloat((total / qty).toFixed(2));
                items.push({
                    id, name, rate, quantity: qty, total: total
                });
            }
        });

        if(!hasData) return showToast('Please enter at least one quantity and total price.', 'error');

        const btn = e.currentTarget;
        const originalText = btn.textContent;
        btn.textContent = 'Saving to Cloud...';
        btn.disabled = true;

        try {
            const payload = {
                date: document.getElementById('entry-date').value,
                items: items
            };
            const dataStr = encodeURIComponent(JSON.stringify(payload));
            const result = await jsonp(API_URL + '?action=save_purchases&data=' + dataStr);
            
            if(result.success) {
                if(result.alertsSent) {
                    showToast('Saved! ⚠️ Price alert email sent!', 'success');
                } else {
                    showToast('Entry saved successfully to Google Sheets!', 'success');
                }
                // Clear inputs
                document.querySelectorAll('.qty-input, .total-input').forEach(i => i.value = '');
                updateGrandTotal();
                // Refresh last prices from sheet
                fetchDataFromSheet(); 
            } else {
                showToast('Error: ' + (result.error || 'Unknown'), 'error');
            }
        } catch (error) {
            console.error('Save error:', error);
            showToast('Failed to save data. Check connection.', 'error');
        } finally {
            btn.textContent = originalText;
            btn.disabled = false;
        }
    });

    // Always render UI immediately with default products
    renderProductsList();
    renderDailyEntryForm();

    // Search Products Listener (Products Tab)
    const productSearchInput = document.getElementById('product-search');
    if (productSearchInput) {
        productSearchInput.addEventListener('input', (e) => {
            renderProductsList(e.target.value.toLowerCase());
        });
    }

    // Search Statistics Listener
    const statsSearchInput = document.getElementById('stats-search');
    if (statsSearchInput) {
        statsSearchInput.addEventListener('input', (e) => {
            renderStatisticsList(e.target.value.toLowerCase());
        });
    }

    // Search Daily Entry Listener
    const dailySearchInput = document.getElementById('daily-search');
    if (dailySearchInput) {
        dailySearchInput.addEventListener('input', (e) => {
            renderDailyEntryForm(e.target.value.toLowerCase());
        });
    }

    // Removed Try/Catch Cache logic as requested by user

    // Try connecting to Google Sheet immediately
    if (API_URL) {
        checkConnection();
    } else {
        syncStatus.innerHTML = '<span class="dot" style="background:#f59e0b"></span> Offline Mode';
    }

});

// =============================================
// Connection & Data Functions
// =============================================

function switchView(viewId) {
    views.forEach(v => v.classList.remove('active'));
    document.getElementById(viewId).classList.add('active');

    // Update sidebar highlighted link
    navLinks.forEach(link => {
        if (link.getAttribute('data-target') === viewId) {
            link.classList.add('active');
        } else {
            link.classList.remove('active');
        }
    });

    // Toggle global action bar
    const globalActionBar = document.getElementById('global-action-bar');
    if (globalActionBar) {
        globalActionBar.style.display = (viewId === 'daily-entry-view') ? 'flex' : 'none';
    }

    const titles = {
        'daily-entry-view': { t: 'Daily Entry', s: "Record today's purchases." },
        'products-view': { t: 'Products', s: 'Manage your raw materials.' },
        'history-view': { t: 'History', s: 'View past entries.' },
        'statistics-view': { t: 'Statistics', s: 'View highest and lowest prices.' },
        'settings-view': { t: 'Settings', s: 'Configure app connection.' }
    };
    pageTitle.textContent = titles[viewId].t;
    pageSubtitle.textContent = titles[viewId].s;
}

async function checkConnection() {
    syncStatus.innerHTML = '<span class="dot" style="background:var(--accent-color)"></span> Connecting...';
    try {
        await fetchDataFromSheet();
        isConnected = true;
        syncStatus.innerHTML = '<span class="dot green"></span> Connected to Google Sheets';
        showToast('Connected to Google Sheets!', 'success');
    } catch (e) {
        isConnected = false;
        syncStatus.innerHTML = '<span class="dot" style="background:#f59e0b"></span> Connection Failed';
        console.error('--- CONNECTION ERROR ---');
        console.error('Error:', e.message);
        console.error('API URL:', API_URL);
        showToast('Connection failed: ' + e.message, 'error');
    }
}

async function fetchDataFromSheet() {
    if(!API_URL) throw new Error('No API URL');

    console.log('Connecting via JSONP to:', API_URL);

    // Fetch products
    const pData = await jsonp(API_URL + '?action=get_products');
    console.log('Products response:', pData);
    
    if(pData.success && pData.data) {
        products = [...pData.data];
        products.sort((a, b) => a.name.localeCompare(b.name, undefined, {sensitivity: 'base'}));
        const searchTerm = document.getElementById('product-search').value.toLowerCase();
        renderProductsList(searchTerm);
        updateDatalists();
    }

    // Fetch last prices
    const lData = await jsonp(API_URL + '?action=get_last_prices');
    if(lData.success) {
        lastPrices = lData.data;
    }

    // Fetch full statistics
    const sData = await jsonp(API_URL + '?action=get_statistics');
    if(sData.success) {
        productStats = sData.data;
        renderStatisticsList(document.getElementById('stats-search') ? document.getElementById('stats-search').value.toLowerCase() : '');
    }

    renderDailyEntryForm();
}

// =============================================
// Render Functions
// =============================================

function setupCombobox(inputId, dropdownId, dataSet) {
    const input = document.getElementById(inputId);
    const dropdown = document.getElementById(dropdownId);
    if (!input || !dropdown) return;

    const renderOptions = (filter = '') => {
        const filtered = Array.from(dataSet).filter(i => i.toLowerCase().includes(filter.toLowerCase()));
        if (filtered.length === 0) {
            dropdown.innerHTML = `<div class="combobox-option" style="color:var(--text-secondary)">Type to add new...</div>`;
            return;
        }
        dropdown.innerHTML = filtered.map(item => `<div class="combobox-option">${item}</div>`).join('');
        
        dropdown.querySelectorAll('.combobox-option').forEach(opt => {
            opt.addEventListener('mousedown', (e) => { // mousedown fires before blur
                e.preventDefault();
                e.stopPropagation();
                if (opt.textContent !== 'Type to add new...') {
                    input.value = opt.textContent;
                }
                dropdown.classList.remove('active');
            });
        });
    };

    input.addEventListener('focus', () => {
        renderOptions(input.value);
        dropdown.classList.add('active');
    });

    input.addEventListener('input', (e) => {
        renderOptions(e.target.value);
        dropdown.classList.add('active');
    });

    input.addEventListener('blur', () => {
        dropdown.classList.remove('active');
    });
}

function updateDatalists() {
    const categories = new Set(['Vegetable', 'Meat', 'Dairy', 'Spices', 'Grocery']);
    const units = new Set(['Kg', 'Litre', 'Piece', 'Dozen', 'Packet']);

    products.forEach(p => {
        if (p.category) categories.add(p.category);
        if (p.unit) units.add(p.unit);
    });

    const sortedCats = Array.from(categories).sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
    const sortedUnits = Array.from(units).sort((a, b) => a.localeCompare(b, undefined, {sensitivity: 'base'}));
    
    setupCombobox('prod-category', 'category-dropdown', sortedCats);
    setupCombobox('prod-unit', 'unit-dropdown', sortedUnits);
}

function renderProductsList(searchTerm = '') {
    const tbody = document.getElementById('products-list-body');
    tbody.innerHTML = '';
    
    const filteredProducts = products.filter(p => 
        p.name.toLowerCase().includes(searchTerm) || 
        p.category.toLowerCase().includes(searchTerm)
    );
    
    filteredProducts.forEach(p => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${p.name}</strong></td>
            <td><span style="background:rgba(255,255,255,0.1); padding:4px 8px; border-radius:12px; font-size:12px;">${p.category}</span></td>
            <td>${p.unit}</td>
            <td>
                <button class="btn primary" onclick="editProduct('${p.id}')" style="padding:0.25rem 0.5rem; background:var(--card-bg); color:var(--text-primary); border:var(--glass-border); margin-right:0.5rem; cursor:pointer">✎ Edit</button>
                <button class="btn delete-btn" onclick="deleteProduct('${p.id}')" style="padding:0.25rem 0.5rem; background:transparent; color:var(--danger-color); cursor:pointer">✕ Remove</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function editProduct(id) {
    const product = products.find(p => p.id === id);
    if (!product) return;
    
    document.getElementById('prod-id').value = product.id;
    document.getElementById('prod-name').value = product.name;
    document.getElementById('prod-category').value = product.category;
    document.getElementById('prod-unit').value = product.unit;
    
    document.getElementById('product-modal-title').textContent = 'Edit Product';
    document.getElementById('product-modal').classList.add('active');
}

async function deleteProduct(id) {
    if(!API_URL || !isConnected) {
        return showToast('Connect to Google Sheets first to delete.', 'error');
    }

    // Optimistically update UI
    const originalProducts = [...products];
    products = products.filter(p => p.id !== id);
    const searchTerm = document.getElementById('product-search').value.toLowerCase();
    renderProductsList(searchTerm);
    renderDailyEntryForm();
    showToast('Deleting product...', 'info');

    try {
        const response = await jsonp(API_URL + '?action=delete_product&id=' + id);
        if (response.success) {
            showToast('Product deleted from Sheets.', 'success');
        } else {
            throw new Error(response.error);
        }
    } catch (error) {
        // Revert on failure
        products = originalProducts;
        renderProductsList(searchTerm);
        renderDailyEntryForm();
        showToast('Failed to delete: ' + error.message, 'error');
    }
}

function renderDailyEntryForm(searchTerm = '') {
    const tbody = document.getElementById('daily-entry-body');
    tbody.innerHTML = '';
    
    // Store currently entered values to prevent losing them during search filter
    const currentValues = {};
    document.querySelectorAll('.qty-input').forEach(input => {
        if (input.value) currentValues[input.getAttribute('data-id') + '_qty'] = input.value;
    });
    document.querySelectorAll('.total-input').forEach(input => {
        const id = input.closest('tr').querySelector('.qty-input').getAttribute('data-id');
        if (input.value) currentValues[id + '_total'] = input.value;
    });

    const filteredProducts = products.filter(p => 
        p.name.toLowerCase().includes(searchTerm) || 
        p.category.toLowerCase().includes(searchTerm)
    );
    
    filteredProducts.forEach(p => {
        const lastRate = lastPrices[p.id] || 0;
        const savedQty = currentValues[p.id + '_qty'] || '';
        const savedTotal = currentValues[p.id + '_total'] || '';
        
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${p.name}</strong><br><small style="color:var(--text-secondary)">${lastRate > 0 ? 'Last Rate: ₹' + lastRate + '/' + p.unit : 'No history'}</small></td>
            <td>${p.category}</td>
            <td>
                <div style="display:flex; align-items:center; gap:0.5rem">
                    <input type="number" class="qty-input" data-id="${p.id}" data-name="${p.name}" placeholder="0" step="0.01" value="${savedQty}">
                    <span style="color:var(--text-secondary)">${p.unit}</span>
                </div>
            </td>
            <td>
                <div style="display:flex; align-items:center; gap:0.5rem">
                    <span>₹</span>
                    <input type="number" class="total-input" placeholder="0.00" step="0.01" value="${savedTotal}">
                </div>
            </td>
            <td>
                <strong>₹<span class="calc-rate">0.00</span><span style="color:var(--text-secondary); font-size:0.75rem">/${p.unit}</span></strong>
            </td>
            <td class="status-cell">
                <span class="price-same">-</span>
            </td>
        `;
        tbody.appendChild(tr);

        const qtyInput = tr.querySelector('.qty-input');
        const totalInput = tr.querySelector('.total-input');
        const rateSpan = tr.querySelector('.calc-rate');
        const statusCell = tr.querySelector('.status-cell');

        const calculate = () => {
            const qty = parseFloat(qtyInput.value) || 0;
            const total = parseFloat(totalInput.value) || 0;
            
            // Auto-calculate rate per unit
            const rate = (qty > 0 && total > 0) ? (total / qty) : 0;
            rateSpan.textContent = rate.toFixed(2);
            
            // Compare with previous rate
            if (rate > 0 && lastRate > 0) {
                if (rate > lastRate) {
                    const diff = (((rate - lastRate) / lastRate) * 100).toFixed(1);
                    statusCell.innerHTML = `<span class="price-up">▲ ${diff}% Expensive</span>`;
                } else if (rate < lastRate) {
                    const diff = (((lastRate - rate) / lastRate) * 100).toFixed(1);
                    statusCell.innerHTML = `<span class="price-down">▼ ${diff}% Cheaper</span>`;
                } else {
                    statusCell.innerHTML = `<span class="price-same">= Same</span>`;
                }
            } else {
                statusCell.innerHTML = `<span class="price-same">-</span>`;
            }

            updateGrandTotal();
        };

        qtyInput.addEventListener('input', calculate);
        totalInput.addEventListener('input', calculate);

        // Enter on Qty -> jump to Total in same row
        qtyInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                totalInput.focus();
            }
        });

        // Enter on Total -> jump to Qty of next row
        totalInput.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                e.preventDefault();
                const nextRow = tr.nextElementSibling;
                if (nextRow) {
                    const nextQty = nextRow.querySelector('.qty-input');
                    if (nextQty) nextQty.focus();
                }
            }
        });
    });
}

function formatDateToDDMMYYYY(dateStr) {
    if (!dateStr) return '';
    const parts = dateStr.split('-');
    if (parts.length === 3) {
        return `${parts[2]}-${parts[1]}-${parts[0]}`;
    }
    return dateStr;
}

function renderStatisticsList(searchTerm = '') {
    const tbody = document.getElementById('statistics-body');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    const statKeys = Object.keys(productStats);
    
    if (statKeys.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-secondary)">No purchase data available yet.</td></tr>';
        return;
    }

    const filteredKeys = statKeys.filter(id => {
        const stats = productStats[id];
        return stats.name.toLowerCase().includes(searchTerm);
    });
    
    filteredKeys.forEach(id => {
        const stats = productStats[id];
        const tr = document.createElement('tr');
        
        tr.innerHTML = `
            <td><strong>${stats.name}</strong></td>
            <td>₹${stats.lastPrice} <br><small style="color:var(--text-secondary)">(${formatDateToDDMMYYYY(stats.lastDate)})</small></td>
            <td style="color:var(--success-color)"><strong>₹${stats.minPrice}</strong> <br><small style="color:var(--text-secondary)">(${formatDateToDDMMYYYY(stats.minDate)})</small></td>
            <td style="color:var(--danger-color)"><strong>₹${stats.maxPrice}</strong> <br><small style="color:var(--text-secondary)">(${formatDateToDDMMYYYY(stats.maxDate)})</small></td>
        `;
        tbody.appendChild(tr);
    });
}

async function fetchHistoryForDate(dateStr) {
    if(!API_URL || !isConnected) {
        return showToast('Connect to Google Sheets first.', 'error');
    }
    const tbody = document.getElementById('history-body');
    const totalEl = document.getElementById('history-total');
    if (!tbody) return;
    
    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-secondary)">Loading history...</td></tr>';
    totalEl.textContent = '₹0.00';
    
    try {
        const response = await jsonp(API_URL + '?action=get_history&date=' + encodeURIComponent(dateStr));
        if (response.success) {
            renderHistoryTable(response.data);
        } else {
            showToast('Failed to load history', 'error');
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--danger-color)">Error loading history.</td></tr>';
        }
    } catch(e) {
        showToast('Error loading history', 'error');
    }
}

function renderHistoryTable(items) {
    const tbody = document.getElementById('history-body');
    const totalEl = document.getElementById('history-total');
    if (!tbody) return;
    
    tbody.innerHTML = '';
    let grandTotal = 0;
    
    if (!items || items.length === 0) {
        tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; color:var(--text-secondary)">No purchases recorded on this date.</td></tr>';
        return;
    }
    
    items.forEach(item => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td><strong>${item.name}</strong></td>
            <td>${item.quantity}</td>
            <td><strong>₹${parseFloat(item.total).toFixed(2)}</strong></td>
            <td><span style="color:var(--text-secondary); font-size:0.875rem">₹${parseFloat(item.rate).toFixed(2)}</span></td>
        `;
        tbody.appendChild(tr);
        grandTotal += parseFloat(item.total) || 0;
    });
    
    totalEl.textContent = '₹' + grandTotal.toFixed(2);
}

function updateGrandTotal() {
    let grand = 0;
    document.querySelectorAll('.total-input').forEach(input => {
        grand += parseFloat(input.value) || 0;
    });
    document.getElementById('grand-total').textContent = '₹' + grand.toFixed(2);
}

function showToast(message, type = 'success') {
    toastEl.textContent = message;
    toastEl.className = 'toast ' + type + ' show';
    setTimeout(() => {
        toastEl.classList.remove('show');
    }, 3000);
}
