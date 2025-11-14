// ==UserScript==
// @name            Odoo Fast Product Search
// @name:tr         Odoo Hızlı Ürün Arama
// @namespace       https://github.com/sipsak
// @version         1.4
// @description     Adds a search box to quickly look up a desired product in Odoo and navigate directly to its product form page.
// @description:tr  Odoo'ya istenilen ürünü hızlıca arayıp ürün kartının içine gidebilmek için bir arama kutusu ekler.
// @author          Burak Şipşak
// @match           https://portal.bskhvac.com.tr/*
// @match           https://*.odoo.com/*
// @grant           GM_registerMenuCommand
// @grant           GM_setValue
// @grant           GM_getValue
// @grant           GM_addStyle
// @grant           GM_getResourceText
// @resource        VIEWER_CSS https://raw.githubusercontent.com/fengyuanchen/viewerjs/main/dist/viewer.min.css
// @require         https://raw.githubusercontent.com/fengyuanchen/viewerjs/main/dist/viewer.min.js
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
        uid: null,
        lang: null,
        context: {},
        server_version_info: null,
        csrf_token: null
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
            clear: 'Temizle'
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
            clear: 'Clear'
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

    function getOdooMajorVersion() {
        if (!ODOO_CONFIG.server_version_info || ODOO_CONFIG.server_version_info.length === 0) {
            return 17;
        }
        const versionString = String(ODOO_CONFIG.server_version_info[0]);
        const match = versionString.match(/\d+/);
        if (match) {
            return parseInt(match[0], 10);
        }
        return 17;
    }

    const searchButtonHTML = `
        <div id="product-search-button">
            <button type="button" class="o_nav_entry" tabindex="0" aria-expanded="false" title="Ürün Ara">
                <i class="fa fa-search" role="img" aria-label="Ürün Ara"></i>
            </button>
        </div>
    `;

    const searchFieldHTML = `
        <div id="product-search-field" class="align-items-center">
            <div class="o_cp_searchview d-flex input-group" role="search">
                <div class="o_searchview form-control d-print-contents d-flex align-items-center py-1" role="search" aria-autocomplete="list" aria-expanded="false">
                    <i class="o_searchview_icon oi oi-search me-2" role="img"></i>
                    <div class="o_searchview_input_container d-flex flex-grow-1 flex-wrap gap-1 mw-100">
                        <input type="text" id="product-search-input" class="o_searchview_input o_input d-print-none flex-grow-1 w-auto border-0 focus" role="searchbox" aria-selected="true" autocomplete="off" placeholder="">
                    </div>
                </div>
            </div>
            <div id="search-suggestions" class="dropdown-menu o-dropdown--menu show"></div>
            <div id="search-status" class="dropdown-menu o-dropdown--menu show"></div>
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

        #product-search-field .o_cp_searchview {
            width: 100%;
        }
        #search-suggestions {
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            right: 0;
            border-radius: 4px;
            max-height: 550px;
            overflow-y: auto;
            z-index: 99999;
            display: none;
        }
        #search-status {
            position: absolute;
            top: calc(100% + 4px);
            left: 0;
            right: 0;
            padding: 6px 8px;
            font-size: 12px;
            text-align: center;
            border-radius: 4px;
            display: none;
            z-index: 99998;
        }
        .search-loader {
            display: block;
            width: 24px;
            height: 24px;
            margin: 16px auto;
            -webkit-mask-image: url('/web/static/img/spin.svg');
            mask-image: url('/web/static/img/spin.svg');
            -webkit-mask-size: contain;
            mask-size: contain;
            -webkit-mask-repeat: no-repeat;
            mask-repeat: no-repeat;
            -webkit-mask-position: center;
            mask-position: center;
            background-color: currentColor;
        }
        .lazy-load-indicator {
            padding: 8px;
            display: flex;
            justify-content: center;
            align-items: center;
            height: 36px;
        }

        .lds-ellipsis,
        .lds-ellipsis div {
          box-sizing: border-box;
        }
        .lds-ellipsis {
          display: inline-block;
          position: relative;
          width: 80px;
          height: 80px;
          transform: scale(0.3);
        }
        .lds-ellipsis div {
          position: absolute;
          top: 33.33333px;
          width: 13.33333px;
          height: 13.33333px;
          border-radius: 50%;
          background: currentColor;
          animation-timing-function: cubic-bezier(0, 1, 1, 0);
        }
        .lds-ellipsis div:nth-child(1) {
          left: 8px;
          animation: lds-ellipsis1 0.6s infinite;
        }
        .lds-ellipsis div:nth-child(2) {
          left: 8px;
          animation: lds-ellipsis2 0.6s infinite;
        }
        .lds-ellipsis div:nth-child(3) {
          left: 32px;
          animation: lds-ellipsis2 0.6s infinite;
        }
        .lds-ellipsis div:nth-child(4) {
          left: 56px;
          animation: lds-ellipsis3 0.6s infinite;
        }
        @keyframes lds-ellipsis1 {
          0% {
            transform: scale(0);
          }
          100% {
            transform: scale(1);
          }
        }
        @keyframes lds-ellipsis3 {
          0% {
            transform: scale(1);
          }
          100% {
            transform: scale(0);
          }
        }
        @keyframes lds-ellipsis2 {
          0% {
            transform: translate(0, 0);
          }
          100% {
            transform: translate(24px, 0);
          }
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
    `;

    function debounce(func, wait) {
        let timeout;
        const executedFunction = function(...args) {
            clearTimeout(timeout);
            timeout = setTimeout(() => func(...args), wait);
        };

        executedFunction.cancel = function() {
            clearTimeout(timeout);
        };

        return executedFunction;
    }

    const debouncedSearch = debounce(async (query) => {
        if (query.length < 2) {
            if (currentSearchAbortController) {
                currentSearchAbortController.abort();
                currentSearchAbortController = null;
            }
            isSearching = false;
            hideSuggestions();
            lastSuggestionsCache = { term: query, results: [] };
            enterPressState = { pressed: false, ctrlKey: false };
            return;
        }
        await searchSuggestions(query, true);
    }, 100);

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

        try {
            const viewerCSS = GM_getResourceText('VIEWER_CSS');
            GM_addStyle(viewerCSS);
        } catch (e) {
            console.error("Viewer.js CSS yüklenemedi:", e);
        }

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

        updatePlaceholder();
        setupEvents();
        startObserving();
        observeModalBackdrop();
    }

    function startObserving() {
        const observer = new MutationObserver((mutations) => {
            const searchButton = document.getElementById('product-search-button');
            if (!searchButton) {
                setTimeout(() => {
                    if (!document.getElementById('product-search-button')) {
                        addSearchToNavbar();
                    }
                }, 100);
            }
        });

        const targetNode = document.querySelector('.o_menu_systray') || document.body;
        observer.observe(targetNode, {
            childList: true,
            subtree: true
        });
    }

    function observeModalBackdrop() {
        const searchField = document.getElementById('product-search-field');
        if (!searchField) return;

        const handleBackdrop = () => {
            const isModalOpen = document.querySelector('.o_blockUI') || document.body.classList.contains('modal-open');

            if (isModalOpen) {
                searchField.style.zIndex = '1';
            } else {
                searchField.style.zIndex = '';
            }
        };

        handleBackdrop();

        const observer = new MutationObserver(() => {
            handleBackdrop();
        });

        observer.observe(document.body, {
            childList: true,
            attributes: true,
            attributeFilter: ['class']
        });
    }

    function setupEvents() {
        const suggestionsDiv = document.getElementById('search-suggestions');

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
                    if (searchInput.value.trim().length > 0) {
                        hideSuggestions();
                    } else {
                        hideSearchField();
                    }
                }
            }
        }, true);

        searchInput.addEventListener('input', (e) => {
            const query = e.target.value.trim();
            lastSearchTerm = query;
            enterPressState = { pressed: false, ctrlKey: false };

            if (query.length > 0) {
                addClearButton();
            } else {
                removeClearButton();
            }

            debouncedSearch(query);
        });

        searchInput.addEventListener('focus', () => {
            if (searchFieldContainer.classList.contains('visible')) {
                const query = searchInput.value.trim();
                if (query.length >= 2 && lastSuggestionsCache.term === query && lastSuggestionsCache.results.length > 0) {
                    renderSuggestions(lastSuggestionsCache.results, query);
                    showSuggestions();
                }
            }
        });

        searchFieldContainer.addEventListener('click', (e) => {
            const clearBtn = e.target.closest('#product-search-clear-btn');
            if (!clearBtn) return;

            e.preventDefault();
            e.stopPropagation();

            debouncedSearch.cancel();

            if (currentSearchAbortController) {
                currentSearchAbortController.abort();
                currentSearchAbortController = null;
            }
            isSearching = false;

            searchInput.value = '';
            lastSearchTerm = '';
            lastSuggestionsCache = { term: '', results: [] };
            hideSuggestions();
            setStatus(null);
            removeClearButton();
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
                if (e.target.classList.contains('image-zoomable')) {
                    e.preventDefault();
                    const productId = suggestionLink.dataset.id;
                    showImageViewer(productId);
                    hideSuggestions();
                    return;
                }
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

        if (lastSearchTerm.length > 0) {
            addClearButton();
        } else {
            removeClearButton();
        }

        if (lastSearchTerm.length >= 2 && lastSuggestionsCache.term === lastSearchTerm && lastSuggestionsCache.results.length > 0) {
            renderSuggestions(lastSuggestionsCache.results, lastSearchTerm);
        } else {
            hideSuggestions();
        }
    }

    function updatePlaceholder() {
        searchInput.placeholder = getTranslation('placeholder');
    }

    function hideSearchField() {
        searchFieldContainer.classList.remove('visible');
        searchButtonContainer.style.display = '';
        hideSuggestions();
        setStatus(null);
    }

    function addClearButton() {
        if (document.getElementById('product-search-clear-btn')) return;

        const searchView = searchFieldContainer.querySelector('.o_cp_searchview');
        if (searchView) {
            const majorVersion = getOdooMajorVersion();

            let buttonHTML = `
                <button id="product-search-clear-btn" class="o_searchview_dropdown_toggler d-print-none btn btn-outline-secondary rounded-start-0" title="${getTranslation('clear')}" aria-label="${getTranslation('clear')}">
                    <i class="fa fa-times" aria-hidden="true"></i>
                </button>
            `;

            if (majorVersion <= 17) {
                buttonHTML = `
                    <div class="o-dropdown dropdown o-dropdown--no-caret">
                        ${buttonHTML}
                    </div>
                `;
            }
            searchView.insertAdjacentHTML('beforeend', buttonHTML);
        }
    }

    function removeClearButton() {
        const button = document.getElementById('product-search-clear-btn');
        if (!button) return;

        const majorVersion = getOdooMajorVersion();

        if (majorVersion <= 17) {
            const wrapper = button.parentElement;
            if (wrapper && (wrapper.classList.contains('o-dropdown') || wrapper.classList.contains('o-dropdown--no-caret'))) {
                wrapper.remove();
            } else {
                button.remove();
            }
        } else {
            button.remove();
        }
    }

    function clearLastSearchTerm() {
        lastSearchTerm = '';
        lastSuggestionsCache = { term: '', results: [] };
    }

    function getProductUrl(productId) {
        return `${ODOO_CONFIG.url}/web#id=${productId}&cids=1&menu_id=326&action=501&model=product.template&view_type=form`;
    }

    function getProductImageUrl(productId, field = 'image_128') {
        return `${ODOO_CONFIG.url}/web/image?model=product.template&id=${productId}&field=${field}`;
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
            if (!window.Viewer) {
                console.error("Viewer.js kütüphanesi yüklenmemiş veya bulunamadı.");
                hideViewerLoader();
                return;
            }

            const response = await fetch(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': ODOO_CONFIG.csrf_token
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'call',
                    params: {
                        model: 'product.template',
                        method: 'read',
                        args: [[parseInt(productId)]],
                        kwargs: {
                            fields: ['image_1920'],
                            context: ODOO_CONFIG.context
                        }
                    },
                    id: Math.floor(Math.random() * 1000)
                })
            });

            const data = await response.json();
            if (data.error || !data.result?.length) {
                console.error("Resim verisi alınamadı:", data.error || "Sonuç bulunamadı");
                hideViewerLoader();
                return;
            }

            const product = data.result[0];
            const imageData = product.image_1920;
            if (imageData) {
                const viewerContainer = document.createElement('div');
                viewerContainer.style.display = 'none';
                const img = document.createElement('img');
                img.src = getImageDataUrl(imageData);
                viewerContainer.appendChild(img);
                document.body.appendChild(viewerContainer);

                if (viewer) viewer.destroy();

                viewer = new window.Viewer(viewerContainer, {
                    zIndex: 999999,
                    viewed: () => {
                        hideViewerLoader();
                    },
                    hidden: () => {
                        viewer.destroy();
                        viewerContainer.remove();
                    },
                    navbar: false,
                    title: false,
                    toolbar: { zoomIn: 1, zoomOut: 1, oneToOne: 1, reset: 1, prev: 0, play: 0, next: 0, rotateLeft: 1, rotateRight: 1, flipHorizontal: 1, flipVertical: 1 }
                });
                viewer.show();
            } else {
                hideViewerLoader();
            }
        } catch (e) {
            console.error("Resim görüntüleyici hatası:", e);
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
        statusDiv.style.display = 'block';
    }

    function showSuggestions() {
        document.getElementById('search-suggestions').style.display = 'block';
    }

    function hideSuggestions() {
        const suggestionsDiv = document.getElementById('search-suggestions');
        suggestionsDiv.style.display = 'none';
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
                item.classList.remove('focus');
            }
        });
        const newIndex = direction === 1 ? (currentIndex + 1) % items.length : (currentIndex - 1 + items.length) % items.length;
        items[newIndex].classList.add('selected');
        items[newIndex].classList.add('focus');
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
            suggestionsDiv.innerHTML = '<div class="search-loader text-primary"></div>';
            showSuggestions();
        }

        setStatus(null);
        isSearching = true;

        try {
            const response = await fetch(`${ODOO_CONFIG.url}/web/dataset/call_kw`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': ODOO_CONFIG.csrf_token
                },
                body: JSON.stringify({
                    jsonrpc: '2.0',
                    method: 'call',
                    params: {
                        model: 'product.template',
                        method: 'search_read',
                        args: [],
                        kwargs: {
                            domain: ['|', '|', ['barcode', 'ilike', query], ['name', 'ilike', query], ['default_code', 'ilike', query]],
                            fields: ['id', 'name', 'barcode', 'default_code', 'image_128'],
                            limit: SEARCH_LIMIT,
                            offset: currentOffset,
                            context: ODOO_CONFIG.context
                        }
                    },
                    id: Math.floor(Math.random() * 1000)
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
        loader.className = 'lazy-load-indicator text-primary';
        loader.innerHTML = '<div class="lds-ellipsis"><div></div><div></div><div></div><div></div></div>';
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
        return text.replace(regex, '<strong class="text-primary">$1</strong>');
    }

    function buildSuggestionHTML(products, query) {
         return products.map(p => {
            const barcode = p.barcode || '';
            const name = p.name || '';
            const defaultCode = p.default_code || '';
            const img = getProductImageUrl(p.id, 'image_128');
            const url = getProductUrl(p.id);

            const highlightedBarcode = highlightWildcardSearch(barcode, query);
            const highlightedName = highlightWildcardSearch(name, query);
            const highlightedDefaultCode = highlightWildcardSearch(defaultCode, query);

            const secondLine = defaultCode ? `[${highlightedDefaultCode}] ${highlightedName}` : highlightedName;

            const hasImage = !!p.image_128;
            const imgClass = hasImage ? 'image-zoomable' : 'image-placeholder';
            const imgStyle = `width: 36px; height: 36px; object-fit: cover; border-radius: 4px; ${hasImage ? 'cursor: zoom-in;' : 'cursor: default;'}`;
            const imgTitle = hasImage ? 'Büyük resim için tıklayın' : '';

            return `
                <a href="${url}" class="suggestion-item dropdown-item" data-id="${p.id}" style="
                    display: flex; align-items: center; gap: 10px;
                    cursor: pointer;
                    color: inherit;
                    text-decoration: none;
                ">
                    <img src="${img}" style="${imgStyle}" title="${imgTitle}" class="${imgClass}">
                    <div style="flex:1; min-width:0;">
                        <div style="white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${highlightedBarcode}</div>
                        <div style="font-size:12px; white-space:nowrap; overflow:hidden; text-overflow:ellipsis;">${secondLine}</div>
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
            suggestionsDiv.innerHTML = '';
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

    function extractCsrfToken() {
        const scriptTag = document.getElementById('web.layout.odooscript');
        if (scriptTag) {
            const scriptContent = scriptTag.textContent;
            const tokenMatch = scriptContent.match(/csrf_token:\s*"([^"]+)"/);
            if (tokenMatch) {
                return tokenMatch[1];
            }
        }
        return null;
    }

    async function detectOdooConfig() {
        try {
            ODOO_CONFIG.csrf_token = extractCsrfToken();

            if (window.odoo && window.odoo.__session_info__) {
                const s = window.odoo.__session_info__;
                ODOO_CONFIG.db = s.db;
                ODOO_CONFIG.uid = s.uid;
                ODOO_CONFIG.username = s.username;
                ODOO_CONFIG.server_version_info = s.server_version_info;
                if (s.user_context?.lang) {
                    ODOO_CONFIG.lang = s.user_context.lang;
                    ODOO_CONFIG.context = { lang: s.user_context.lang, tz: s.user_context.tz || 'UTC' };
                }
                return true;
            }

            const r = await fetch(`${ODOO_CONFIG.url}/web/session/get_session_info`, {
                method: 'POST',
                headers: {
                    'Content-Type': 'application/json',
                    'X-CSRF-TOKEN': ODOO_CONFIG.csrf_token
                },
                body: JSON.stringify({})
            });

            if (r.ok) {
                const d = await r.json();
                if (d.result) {
                    const s = d.result;
                    ODOO_CONFIG.db = s.db;
                    ODOO_CONFIG.uid = s.uid;
                    ODOO_CONFIG.username = s.username;
                    ODOO_CONFIG.server_version_info = s.server_version_info;
                    if (s.user_context?.lang) {
                        ODOO_CONFIG.lang = s.user_context.lang;
                        ODOO_CONFIG.context = { lang: s.user_context.lang, tz: s.user_context.tz || 'UTC' };
                    }
                    return true;
                }
            }
            return false;
        } catch (e) {
            console.error("Odoo config tespiti hatası:", e);
            return false;
        }
    }

    async function init() {
        const configDetected = await detectOdooConfig();
        if (!configDetected) {
            await new Promise(resolve => setTimeout(resolve, 500));
            const configDetectedAgain = await detectOdooConfig();
            if (!configDetectedAgain) {
                 console.error("Odoo config bilgileri tespit edilemedi.");
                 return;
            }
        }

        if (document.readyState === 'loading') {
            document.addEventListener('DOMContentLoaded', addSearchToNavbar);
        } else {
            addSearchToNavbar();
        }
    }

    init();
})();
