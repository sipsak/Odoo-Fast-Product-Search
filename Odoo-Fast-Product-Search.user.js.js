// ==UserScript==
// @name            Odoo Fast Product Search
// @name:tr         Odoo Hızlı Ürün Arama
// @namespace       https://github.com/sipsak
// @version         1.0
// @description     Adds a search box to quickly look up a desired product in Odoo and navigate directly to its product form page.
// @description:tr  Odoo'ya istenilen ürünü hızlıca arayıp ürün kartının içine gidebilmek için bir arama kutusu ekler.
// @author          Burak Şipşak
// @match           https://portal.bskhvac.com.tr/*
// @match           https://*.odoo.com/*
// @grant           GM_registerMenuCommand
// @grant           GM_setValue
// @grant           GM_getValue
// @icon            data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNTAiIGhlaWdodD0iNTAiIHZpZXdCb3g9IjAgMCA1MCA1MCIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj48cGF0aCBkPSJNNDQuNTIxIDUuNWE0LjQ3NyA0LjQ3NyAwIDAgMSAwIDYuMzMybC0zNC4xOSAzNC4xOUg0VjM5LjY5TDM4LjE5IDUuNWE0LjQ3NyA0LjQ3NyAwIDAgMSA2LjMzMSAwWiIgZmlsbD0iIzJFQkNGQSIvPjxwYXRoIGQ9Ik0xMC45IDE1LjEyMiA0Ljg5OCA5LjEyYTkuMDA0IDkuMDA0IDAgMCAwIDEwLjQ4IDEyLjU2OGwyMy4wMDEgMjNhNC40NzcgNC40NzcgMCAwIDAgNi4zMzEtNi4zM2wtMjMtMjMuMDAxQTkuMDA0IDkuMDA0IDAgMCAwIDkuMTQxIDQuODc3bDYuMDAyIDYuMDAyLTQuMjQzIDQuMjQzWiIgZmlsbD0iIzk4NTE4NCIvPjxwYXRoIGQ9Ik0yNS4wMjMgMTguNjcgMTguNjkgMjVsNi4zMzIgNi4zMzFMMzEuMzUyIDI1bC02LjMzLTYuMzMxWiIgZmlsbD0iIzE0NDQ5NiIvPjwvc3ZnPgo=
// @updateURL       https://raw.githubusercontent.com/sipsak/Odoo-Fast-Product-Search/main/Odoo-Fast-Product-Search.user.js
// @downloadURL     https://raw.githubusercontent.com/sipsak/Odoo-Fast-Product-Search/main/Odoo-Fast-Product-Search.user.js
// ==/UserScript==

(function() {
    'use strict';

    const ODOO_CONFIG = {
        url: window.location.origin,
        db: null,
        username: null,
        api_key: null,
        uid: null,
        lang: null,
        context: {}
    };

    let isSearching = false;
    let currentSearchAbortController = null;
    let lastSearchTerm = '';
    let lastSuggestionsCache = { term: '', results: [] };
    let enterPressState = { pressed: false, ctrlKey: false };
    let viewer = null;

    let searchButtonContainer = null;
    let searchFieldContainer = null;
    let searchInput = null;

    const SEARCH_LIMIT = 25;
    let currentOffset = 0;
    let canLoadMore = true;
    let isLoadingMore = false;


    const translations = {
        'tr_TR': {
            placeholder: 'Ürün kodu, adı veya iç referansı...',
            emptySearchError: 'Lütfen ürün kodunu, adını veya iç referansını girin',
            searching: 'Aranıyor...',
            notFound: 'Ürün bulunamadı',
            foundOpening: 'Ürün bulundu: {name} - Açılıyor...',
            dbError: 'Veritabanı bilgileri tespit edilemedi.',
            apiError: 'API Hatası: {message}',
            searchError: 'Arama sırasında hata oluştu',
            loadingMore: 'Daha fazla sonuç yükleniyor...',
            clear: 'Temizle',
            apiNotSet: 'API Anahtarı ayarlanmamış. Lütfen script menüsünden ayarlayın.',
            apiTitle: 'API',
            apiLabel: "Odoo'dan oluşturduğunuz API anahtarını girin:",
            apiButton: 'Tamam'
        },
        'en_US': {
            placeholder: 'Product code, name or internal reference...',
            emptySearchError: 'Please enter product code, name or internal reference',
            searching: 'Searching...',
            notFound: 'Product not found',
            foundOpening: 'Product found: {name} - Opening...',
            dbError: 'Database information could not be detected.',
            apiError: 'API Error: {message}',
            searchError: 'Error occurred during search',
            loadingMore: 'Loading more results...',
            clear: 'Clear',
            apiNotSet: 'API Key is not set. Please set it from the script menu.',
            apiTitle: 'API',
            apiLabel: 'Enter your API key generated from Odoo:',
            apiButton: 'OK'
        }
    };

    function getTranslation(key, params = {}) {
        const lang = ODOO_CONFIG.lang || 'en_US';
        const langTranslations = translations[lang] || translations['en_US'];
        let text = langTranslations[key] || translations['en_US'][key] || key;
        Object.keys(params).forEach(param => {
            text = text.replace(`{${param}}`, params[param]);
        });
        return text;
    }

    const searchButtonHTML = `
        <div class="o-dropdown dropdown o-dropdown--no-caret" id="product-search-button">
            <button type="button" class="dropdown-toggle" tabindex="0" aria-expanded="false" title="Ürün Ara">
                <i class="fa fa-search" role="img" aria-label="Ürün Ara"></i>
            </button>
        </div>
    `;

    const searchFieldHTML = `
        <div id="product-search-field" class="align-items-center">
            <div class="o_searchview form-control d-flex align-items-center w-100 py-1 px-2">
                <i class="o_searchview_icon fa fa-search text-muted me-2" role="img"></i>
                <div class="o_searchview_input_container d-flex flex-grow-1">
                    <input type="text" id="product-search-input" class="o_searchview_input o_input flex-grow-1 border-0 bg-transparent p-0" placeholder="" autocomplete="off">
                </div>
                <button type="button" id="product-search-clear-btn" class="btn o_searchview_clear d-none" title="Temizle" aria-label="Temizle">
                    <i class="fa fa-times" aria-hidden="true"></i>
                </button>
            </div>
            <div id="search-suggestions"></div>
            <div id="search-status"></div>
        </div>
    `;

    const customCSS = `
        #product-search-field {
            display: none;
            width: 420px;
            max-width: 50vw;
            margin-left: 6px;
            position: relative;
            transition: transform 0.3s ease-out, opacity 0.2s ease-out;
            transform-origin: left;
            transform: scaleX(0.95);
            opacity: 0;
            z-index: 99998;
        }
        #product-search-field.visible {
            transform: scaleX(1);
            opacity: 1;
        }
        #search-suggestions {
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            right: 0;
            background: white;
            border: 1px solid #ddd;
            border-radius: 4px;
            max-height: 550px;
            overflow-y: auto;
            z-index: 99999;
            display: none;
            box-shadow: 0 2px 4px rgba(0,0,0,.1);
        }
        #search-status {
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            right: 0;
            padding: 6px 8px;
            font-size: 12px;
            color: #666;
            text-align: center;
            background: white;
            border: 1px solid #eee;
            border-radius: 4px;
            display: none;
            z-index: 99998;
        }
        .search-loader {
            display: flex;
            justify-content: center;
            align-items: center;
            padding: 16px;
        }
        .search-loader::after {
            content: '';
            width: 24px;
            height: 24px;
            border: 3px solid #f0f0f0;
            border-top-color: #007bff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        @keyframes spin {
            to { transform: rotate(360deg); }
        }
        .lazy-load-indicator {
            padding: 8px;
            text-align: center;
            font-size: 12px;
            color: #888;
        }
        #viewer-loader-overlay {
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            background-color: rgba(0, 0, 0, 0.6);
            display: flex;
            justify-content: center;
            align-items: center;
            z-index: 999999;
        }
        #viewer-loader-overlay::after {
            content: '';
            width: 50px;
            height: 50px;
            border: 5px solid rgba(255, 255, 255, 0.3);
            border-top-color: #fff;
            border-radius: 50%;
            animation: spin 1s linear infinite;
        }
        .o_searchview_clear {
            color: #6c757d;
            background-color: transparent;
            border: 0;
            padding: 0 0.5rem;
            font-size: 0.8rem;
            line-height: 1;
            cursor: pointer;
        }
        .o_searchview_clear:hover {
            color: #212529;
        }
        .userscript-modal-backdrop {
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background: rgba(0,0,0,0.5);
            z-index: 1049;
            display: block;
        }
    `;

    function promptForApiKey() {
        if (document.getElementById('userscript-api-modal')) return;

        const backdrop = document.createElement('div');
        backdrop.className = 'userscript-modal-backdrop';

        const modal = document.createElement('div');
        modal.id = 'userscript-api-modal';
        modal.className = 'modal fade show custom-alert-modal';
        modal.tabIndex = -1;
        modal.role = 'dialog';
        modal.style.display = 'block';
        modal.style.zIndex = '1050';

        modal.innerHTML = `
            <div class="modal-dialog modal-dialog-centered modal-md">
                <div class="modal-content">
                    <header class="modal-header">
                        <h4 class="modal-title text-break">${getTranslation('apiTitle')}</h4>
                        <button type="button" class="btn-close" aria-label="Close"></button>
                    </header>
                    <main class="modal-body">
                        ${getTranslation('apiLabel')}
                        <input type="text" class="form-control" id="userscript-api-key-input" style="margin-top: 10px;" value="${ODOO_CONFIG.api_key || ''}">
                    </main>
                    <footer class="modal-footer justify-content-start">
                        <button class="btn btn-primary" id="userscript-api-save-btn">${getTranslation('apiButton')}</button>
                    </footer>
                </div>
            </div>
        `;

        document.body.appendChild(backdrop);
        document.body.appendChild(modal);

        const closeModal = () => {
            backdrop.remove();
            modal.remove();
        };

        modal.querySelector('.btn-close').addEventListener('click', closeModal);
        backdrop.addEventListener('click', closeModal);
        modal.querySelector('#userscript-api-save-btn').addEventListener('click', async () => {
            const inputVal = modal.querySelector('#userscript-api-key-input').value.trim();
            if (inputVal) {
                await GM_setValue('odoo_api_key', inputVal);
                ODOO_CONFIG.api_key = inputVal;
            }
            closeModal();
        });
    }


    function loadViewerJS() {
        return new Promise((resolve, reject) => {
            if (window.Viewer) {
                resolve();
                return;
            }
            const link = document.createElement('link');
            link.rel = 'stylesheet';
            link.href = 'https://cdnjs.cloudflare.com/ajax/libs/viewerjs/1.11.6/viewer.min.css';
            document.head.appendChild(link);
            const script = document.createElement('script');
            script.src = 'https://cdnjs.cloudflare.com/ajax/libs/viewerjs/1.11.6/viewer.min.js';
            script.onload = resolve;
            script.onerror = reject;
            document.head.appendChild(script);
        });
    }

    function debounce(func, wait) {
        let timeout;
        return function executedFunction(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };
    }

    const debouncedSearch = debounce(async (query) => {
        if (query.length < 2) {
            hideSuggestions();
            lastSuggestionsCache = { term: query, results: [] };
            enterPressState = { pressed: false, ctrlKey: false };
            return;
        }
        await searchSuggestions(query, true);
    }, 300);

    async function addSearchToNavbar() {
        const navbar = document.querySelector('.o_menu_systray');
        if (!navbar) {
            setTimeout(addSearchToNavbar, 300);
            return;
        }
        if (document.getElementById('product-search-button')) return;

        const styleSheet = document.createElement("style");
        styleSheet.innerText = customCSS;
        document.head.appendChild(styleSheet);

        const messagesButtonContainer = navbar.querySelector('.o-mail-DiscussSystray-class');
        if (messagesButtonContainer) {
            messagesButtonContainer.insertAdjacentHTML('beforebegin', searchButtonHTML);
        } else {
            navbar.insertAdjacentHTML('afterbegin', searchButtonHTML);
        }

        const btn = document.getElementById('product-search-button');
        btn.insertAdjacentHTML('afterend', searchFieldHTML);

        searchButtonContainer = btn;
        searchFieldContainer = document.getElementById('product-search-field');
        searchInput = document.getElementById('product-search-input');

        updatePlaceholder(); // Çağrıyı buraya taşıdık

        try {
            await loadViewerJS();
        } catch (e) {
        }
        setupEvents();
    }

    function setupEvents() {
        const suggestionsDiv = document.getElementById('search-suggestions');
        const clearBtn = document.getElementById('product-search-clear-btn');

        searchFieldContainer.addEventListener('transitionend', () => {
            if (!searchFieldContainer.classList.contains('visible')) {
                searchFieldContainer.style.display = 'none';
            }
        });

        document.addEventListener('keydown', (e) => {
            if (e.ctrlKey && e.code === 'Space') {
                e.preventDefault();
                openSearchField();
            }
        });

        searchButtonContainer.addEventListener('click', (e) => {
            e.preventDefault();
            e.stopPropagation();
            openSearchField();
        });

        document.addEventListener('keydown', (e) => {
            if (e.key === 'Escape' && searchFieldContainer.classList.contains('visible')) {
                hideSearchField();
            }
        });

        document.addEventListener('click', (e) => {
            if (!searchFieldContainer.contains(e.target) && !searchButtonContainer.contains(e.target)) {
                if (searchFieldContainer.classList.contains('visible')) {
                    hideSearchField();
                }
            }
        });

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            lastSearchTerm = query;
            enterPressState = { pressed: false, ctrlKey: false };

            if (query.length > 0) {
                clearBtn.classList.remove('d-none');
            } else {
                clearBtn.classList.add('d-none');
            }

            debouncedSearch(query);
        });

        clearBtn.addEventListener('click', () => {
            searchInput.value = '';
            lastSearchTerm = '';
            lastSuggestionsCache = { term: '', results: [] };
            hideSuggestions();
            setStatus(null);
            clearBtn.classList.add('d-none');
            searchInput.focus();
        });

        searchInput.addEventListener('keydown', (e) => {
            if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
                e.preventDefault();
                navigateSuggestions(e.key === 'ArrowDown' ? 1 : -1);
                return;
            }

            if (e.key === 'Enter') {
                e.preventDefault();
                const selectedItem = suggestionsDiv.querySelector('.suggestion-item.selected');

                if (selectedItem && suggestionsDiv.style.display === 'block') {
                    const clickEvent = new MouseEvent('click', {
                        bubbles: true, cancelable: true, view: window, ctrlKey: e.ctrlKey
                    });
                    selectedItem.dispatchEvent(clickEvent);
                    return;
                }

                if (isSearching) {
                    enterPressState = { pressed: true, ctrlKey: e.ctrlKey };
                    setStatus(getTranslation('searching'));
                } else {
                    if (lastSuggestionsCache.results && lastSuggestionsCache.results.length === 1) {
                        handleSingleProductNavigation(lastSuggestionsCache.results[0], e.ctrlKey);
                    }
                }
            }
        });

        suggestionsDiv.addEventListener('click', (e) => {
            const suggestionLink = e.target.closest('.suggestion-item');
            if (!suggestionLink) return;

            if (e.target.tagName === 'IMG') {
                e.preventDefault();
                const productId = suggestionLink.dataset.id;
                showImageViewer(productId);
                hideSuggestions();
                return;
            }

            if (!e.ctrlKey && e.button !== 1) {
                setTimeout(() => {
                    clearLastSearchTerm();
                    hideSearchField();
                }, 100);
            }
        });

        suggestionsDiv.addEventListener('scroll', () => {
            if (isLoadingMore || !canLoadMore) return;
            if (suggestionsDiv.scrollTop + suggestionsDiv.clientHeight >= suggestionsDiv.scrollHeight - 100) {
                loadMoreSuggestions();
            }
        });
    }

    function openSearchField() {
        searchButtonContainer.style.display = 'none';
        searchFieldContainer.style.display = 'flex';
        setTimeout(() => searchFieldContainer.classList.add('visible'), 10);
        updatePlaceholder();
        searchInput.value = lastSearchTerm;
        searchInput.focus();
        searchInput.select();
        setStatus(null);

        const clearBtn = document.getElementById('product-search-clear-btn');
        if (lastSearchTerm.length > 0) {
            clearBtn.classList.remove('d-none');
        } else {
            clearBtn.classList.add('d-none');
        }

        if (lastSearchTerm.length >= 2 && lastSuggestionsCache.term === lastSearchTerm && lastSuggestionsCache.results.length > 0) {
            renderSuggestions(lastSuggestionsCache.results, lastSearchTerm);
        } else {
            hideSuggestions();
        }
    }

    function updatePlaceholder() {
        searchInput.placeholder = getTranslation('placeholder');
        document.getElementById('product-search-clear-btn').title = getTranslation('clear');
        document.getElementById('product-search-clear-btn').setAttribute('aria-label', getTranslation('clear'));
    }

    function hideSearchField() {
        searchFieldContainer.classList.remove('visible');
        searchButtonContainer.style.display = '';
        hideSuggestions();
        setStatus(null);
    }

    function clearLastSearchTerm() {
        lastSearchTerm = '';
        lastSuggestionsCache = { term: '', results: [] };
    }

    function getProductUrl(productId) {
        return `${ODOO_CONFIG.url}/web#id=${productId}&cids=1&menu_id=326&action=501&model=product.template&view_type=form`;
    }

    function getImageDataUrl(imageData) {
        if (!imageData) return 'data:image/svg+xml;base64,PHN2ZyB3aWR0aD0iNDAiIGhlaWdodD0iNDAiIHZpZXdCb3g9IjAgMCA0MCA0MCIgZmlsbD0ibm9uZSIgeG1sbnM9Imh0dHA6Ly93d3cudzMub3JnLzIwMDAvc3ZnIj4KPHJlY3Qgd2lkdGg9IjQwIiBoZWlnaHQ9IjQwIiBmaWxsPSIjRjVGNUY1Ii8+CjxwYXRoIGQ9Ik0xMiAxNkgyOFYyNEgxMlYxNloiIGZpbGw9IiNEREREREQiLz4KPHBhdGggZD0iTTE0IDE4SDE4VjIySDE0VjE4WiIgZmlsbD0iI0JCQkJCQiIvPgo8L3N2Zz4K';
        if (imageData.startsWith('data:')) return imageData;
        return `data:image/png;base64,${imageData}`;
    }

    function showViewerLoader() {
        if (document.getElementById('viewer-loader-overlay')) return;
        const loader = document.createElement('div');
        loader.id = 'viewer-loader-overlay';
        document.body.appendChild(loader);
    }

    function hideViewerLoader() {
        const loader = document.getElementById('viewer-loader-overlay');
        if (loader) {
            loader.remove();
        }
    }

    async function showImageViewer(productId) {
        showViewerLoader();
        try {
            if (!ODOO_CONFIG.db || !window.Viewer || !ODOO_CONFIG.api_key) {
                hideViewerLoader();
                return;
            }
            const response = await fetch(`${ODOO_CONFIG.url}/jsonrpc`, {
                method: 'POST', headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', method: 'call', params: {
                        service: 'object', method: 'execute_kw', args: [
                            ODOO_CONFIG.db, ODOO_CONFIG.uid, ODOO_CONFIG.api_key,
                            'product.template', 'read', [parseInt(productId)],
                            { fields: ['image_1920'], context: ODOO_CONFIG.context }
                        ]
                    }, id: Math.floor(Math.random() * 1000)
                })
            });
            const data = await response.json();
            if (data.error || !data.result?.length) {
                hideViewerLoader();
                return;
            }
            const product = data.result[0];
            const imageData = product.image_1920;
            if (imageData) {
                const viewerContainer = document.createElement('div');
                const img = document.createElement('img');
                img.src = getImageDataUrl(imageData);
                viewerContainer.appendChild(img);

                if (viewer) viewer.destroy();

                viewer = new window.Viewer(viewerContainer, {
                    viewed: () => {
                        hideViewerLoader();
                    },
                    hidden: () => {
                        viewer.destroy();
                    },
                    navbar: false, title: false,
                    toolbar: { zoomIn: 1, zoomOut: 1, oneToOne: 1, reset: 1, prev: 0, play: 0, next: 0, rotateLeft: 1, rotateRight: 1, flipHorizontal: 1, flipVertical: 1 }
                });
                viewer.show();
            } else {
                hideViewerLoader();
            }
        } catch (e) {
            hideViewerLoader();
        }
    }

    function setStatus(message, isError = false) {
        const statusDiv = document.getElementById('search-status');
        if (!message) {
            statusDiv.style.display = 'none';
            return;
        }
        statusDiv.textContent = message;
        statusDiv.style.color = isError ? '#d32f2f' : '#666';
        statusDiv.style.display = 'block';
    }

    function showSuggestions() {
        document.getElementById('search-suggestions').style.display = 'block';
    }

    function hideSuggestions() {
        const suggestionsDiv = document.getElementById('search-suggestions');
        suggestionsDiv.style.display = 'none';
        suggestionsDiv.innerHTML = '';
    }

    function navigateSuggestions(direction) {
        const suggestionsDiv = document.getElementById('search-suggestions');
        const items = suggestionsDiv.querySelectorAll('.suggestion-item');
        if (!items.length) return;
        let currentIndex = -1;
        items.forEach((item, idx) => {
            if (item.classList.contains('selected')) {
                currentIndex = idx;
                item.classList.remove('selected');
                item.style.backgroundColor = '';
            }
        });
        const newIndex = direction === 1 ? (currentIndex + 1) % items.length : (currentIndex - 1 + items.length) % items.length;
        items[newIndex].classList.add('selected');
        items[newIndex].style.backgroundColor = '#f0f0f0';
        items[newIndex].scrollIntoView({ block: 'nearest' });
    }

    function handleSingleProductNavigation(product, ctrlKey) {
        const url = getProductUrl(product.id);
        setStatus(getTranslation('foundOpening', { name: product.name }));
        setTimeout(() => {
            clearLastSearchTerm();
            hideSearchField();
            if (ctrlKey) {
                window.open(url, '_blank');
            } else {
                window.location.href = url;
            }
        }, 300);
    }

    async function searchSuggestions(query, isNewSearch) {
        if (query.length < 2) {
            hideSuggestions();
            return;
        }

        if (isNewSearch) {
            if (currentSearchAbortController) currentSearchAbortController.abort();
            currentSearchAbortController = new AbortController();
            currentOffset = 0;
            canLoadMore = true;
            lastSuggestionsCache = { term: query, results: [] };
            const suggestionsDiv = document.getElementById('search-suggestions');
            suggestionsDiv.innerHTML = '<div class="search-loader"></div>';
            showSuggestions();
        }

        setStatus(null);
        isSearching = true;

        try {
            if (!ODOO_CONFIG.db || !ODOO_CONFIG.api_key) {
                isSearching = false;
                hideSuggestions();
                if (!ODOO_CONFIG.api_key) {
                    setStatus(getTranslation('apiNotSet'), true);
                }
                return;
            };

            const response = await fetch(`${ODOO_CONFIG.url}/jsonrpc`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    jsonrpc: '2.0', method: 'call', params: {
                        service: 'object', method: 'execute_kw', args: [
                            ODOO_CONFIG.db, ODOO_CONFIG.uid, ODOO_CONFIG.api_key,
                            'product.template', 'search_read',
                            [['|', '|', ['barcode', 'ilike', query], ['name', 'ilike', query], ['default_code', 'ilike', query]]],
                            { fields: ['id', 'name', 'barcode', 'default_code', 'image_128'], limit: SEARCH_LIMIT, offset: currentOffset, context: ODOO_CONFIG.context }
                        ]
                    }, id: Math.floor(Math.random() * 1000)
                }),
                signal: currentSearchAbortController.signal
            });

            isSearching = false;
            const data = await response.json();
            if (data.error) {
                hideSuggestions();
                enterPressState = { pressed: false, ctrlKey: false };
                return;
            }

            const products = data.result;
            if (products.length < SEARCH_LIMIT) {
                canLoadMore = false;
            }

            lastSuggestionsCache.results.push(...products);

            if (enterPressState.pressed && isNewSearch) {
                const wasCtrl = enterPressState.ctrlKey;
                enterPressState = { pressed: false, ctrlKey: false };

                if (products.length === 1) {
                    handleSingleProductNavigation(products[0], wasCtrl);
                    return;
                }
            }

            if(isNewSearch) {
                renderSuggestions(products, query);
            } else {
                appendSuggestions(products, query);
            }

        } catch (err) {
            isSearching = false;
            if (err.name !== 'AbortError') {
                hideSuggestions();
                enterPressState = { pressed: false, ctrlKey: false };
            }
        }
    }

    async function loadMoreSuggestions() {
        if(isLoadingMore || !canLoadMore) return;

        isLoadingMore = true;
        currentOffset += SEARCH_LIMIT;

        const suggestionsDiv = document.getElementById('search-suggestions');
        const loader = document.createElement('div');
        loader.className = 'lazy-load-indicator';
        loader.textContent = getTranslation('loadingMore');
        suggestionsDiv.appendChild(loader);

        await searchSuggestions(lastSearchTerm, false);

        const existingLoader = suggestionsDiv.querySelector('.lazy-load-indicator');
        if (existingLoader) {
            existingLoader.remove();
        }

        isLoadingMore = false;
    }

    function highlightWildcardSearch(text, query) {
        if (!text || !query) return text;

        const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
        const parts = query.split(/[%_]/).filter(p => p);
        if (parts.length === 0) return text;

        const regex = new RegExp(`(${parts.map(escapeRegex).join('|')})`, 'gi');
        return text.replace(regex, '<strong style="color: rgb(113, 75, 103);">$1</strong>');
    }

    function buildSuggestionHTML(products, query) {
         return products.map(p => {
            const barcode = p.barcode || '';
            const name = p.name || '';
            const defaultCode = p.default_code || '';
            const img = getImageDataUrl(p.image_128);
            const url = getProductUrl(p.id);

            const highlightedBarcode = highlightWildcardSearch(barcode, query);
            const highlightedName = highlightWildcardSearch(name, query);
            const highlightedDefaultCode = highlightWildcardSearch(defaultCode, query);

            const secondLine = defaultCode ? `[${highlightedDefaultCode}] ${highlightedName}` : highlightedName;
            return `
                <a href="${url}" class="suggestion-item" data-id="${p.id}" style="
                    display: flex; align-items: center; gap: 10px;
                    padding: 8px 10px;
                    cursor: pointer;
                    border-bottom: 1px solid #eee;
                    background-color: white;
                    color: inherit;
                    text-decoration: none;
                " onmouseover="this.style.backgroundColor='#f0f0f0'; this.classList.remove('selected');"
                   onmouseout="if(!this.classList.contains('selected')) this.style.backgroundColor='white';">
                    <img src="${img}" style="width: 36px; height: 36px; object-fit: cover; border-radius: 4px; border: 1px solid #ddd; cursor: zoom-in;" title="Büyük resim için tıklayın">
                    <div style="flex:1; min-width:0;">
                        <div style="font-weight:600; color:#333; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${highlightedBarcode}</div>
                        <div style="font-size:11px; color:#666; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${secondLine}</div>
                    </div>
                </a>
            `;
        }).join('');
    }

    function renderSuggestions(products, query) {
        const suggestionsDiv = document.getElementById('search-suggestions');
        if (!products || !products.length) {
            setStatus(getTranslation('notFound'));
            hideSuggestions();
            return;
        }

        const suggestionsHTML = buildSuggestionHTML(products, query);
        suggestionsDiv.innerHTML = suggestionsHTML;
        showSuggestions();
    }

    function appendSuggestions(products, query) {
        const suggestionsDiv = document.getElementById('search-suggestions');
        if (!products || !products.length) {
            return;
        }
        const suggestionsHTML = buildSuggestionHTML(products, query);
        suggestionsDiv.insertAdjacentHTML('beforeend', suggestionsHTML);
    }

    async function detectOdooConfig() {
        try {
            const r = await fetch(`${ODOO_CONFIG.url}/web/session/get_session_info`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({})
            });

            if (r.ok) {
                const d = await r.json();
                if (d.result) {
                    const s = d.result;
                    ODOO_CONFIG.db = s.db;
                    ODOO_CONFIG.uid = s.uid;
                    ODOO_CONFIG.username = s.username;
                    if (s.user_context?.lang) {
                        ODOO_CONFIG.lang = s.user_context.lang;
                        ODOO_CONFIG.context = { lang: s.user_context.lang, tz: s.user_context.tz || 'UTC' };
                    }
                    return true;
                }
            }
            return false;
        } catch (e) {
            return false;
        }
    }

    async function init() {
        ODOO_CONFIG.api_key = await GM_getValue('odoo_api_key', null);
        GM_registerMenuCommand(getTranslation('apiTitle'), promptForApiKey);

        const configDetected = await detectOdooConfig();
        if (!configDetected) {
            return;
        }

        // updatePlaceholder(); // Bu satırı buradan kaldırıyoruz

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', addSearchToNavbar);
        } else {
            addSearchToNavbar();
        }
    }

    init();
})();

