(function () {
  const icons = {
    dashboard: '<path d="M3 3h7v7H3zM14 3h7v4h-7zM14 10h7v11h-7zM3 13h7v8H3z"/>',
    products: '<path d="M21 8l-9-5-9 5 9 5 9-5z"/><path d="M3 8v8l9 5 9-5V8"/><path d="M12 13v8"/>',
    inventory: '<path d="M3 7l9-4 9 4-9 4-9-4z"/><path d="M3 12l9 4 9-4"/><path d="M3 17l9 4 9-4"/>',
    purchases: '<circle cx="9" cy="20" r="1.4"/><circle cx="18" cy="20" r="1.4"/><path d="M2 3h2l2.6 12.6a2 2 0 0 0 2 1.6h8.8a2 2 0 0 0 2-1.6L21 7H6"/>',
    orders: '<path d="M8 3h8v4H8z"/><rect x="5" y="6" width="14" height="15" rx="2"/><path d="M9 12h6M9 16h6"/>',
    reports: '<path d="M4 20V10M11 20V4M18 20v-7"/>',
    settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .34 1.87l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.7 1.7 0 0 0-1.87-.34 1.7 1.7 0 0 0-1 1.55V21a2 2 0 1 1-4 0v-.09A1.7 1.7 0 0 0 9 19.36a1.7 1.7 0 0 0-1.87.34l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06A1.7 1.7 0 0 0 4.64 15a1.7 1.7 0 0 0-1.55-1H3a2 2 0 1 1 0-4h.09A1.7 1.7 0 0 0 4.64 9a1.7 1.7 0 0 0-.34-1.87l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06A1.7 1.7 0 0 0 9 4.64 1.7 1.7 0 0 0 10 3.09V3a2 2 0 1 1 4 0v.09A1.7 1.7 0 0 0 15 4.64a1.7 1.7 0 0 0 1.87-.34l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06A1.7 1.7 0 0 0 19.36 9a1.7 1.7 0 0 0 1.55 1H21a2 2 0 1 1 0 4h-.09a1.7 1.7 0 0 0-1.51 1z"/>',
    'company-settings': '<path d="M3 21h18M6 21V7l6-4 6 4v14M9 21v-6h6v6M9 11h.01M9 15h.01M15 11h.01M15 15h.01"/>',
    accounts: '<rect x="2" y="6" width="20" height="13" rx="2"/><path d="M2 10h20M6 15h4"/>',
    users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M19 8v6M22 11h-6"/>',
    audit: '<path d="M3 3h18v18H3z"/><path d="M7 8h10M7 12h10M7 16h6"/>',
    notifications: '<path d="M18 8a6 6 0 0 0-12 0c0 7-3 7-3 9h18c0-2-3-2-3-9M10 21h4"/>'
    ,ai: '<path d="M12 3a9 9 0 1 0 9 9"/><path d="M12 7v5l3 2"/>'
  };

  const navItems = [
    { label: 'Dashboard', href: '/admin', dataNav: 'dashboard' },
    { label: 'Products', href: '/admin/products', dataNav: 'products' },
    { label: 'Inventory', href: '/admin/inventory', dataNav: 'inventory' },
    { label: 'Purchases', href: '/admin/purchases', dataNav: 'purchases' },
    { label: 'Orders', href: '/admin/orders', dataNav: 'orders' },
    { label: 'Reports', href: '/admin/reports', dataNav: 'reports' }
  ];

  const settingsItems = [
    { label: 'Settings', href: '/admin/settings.html', dataNav: 'settings' },
    { label: 'Company Info', href: '/admin/company-settings.html', dataNav: 'company-settings' },
    { label: 'Notifications', href: '/admin/notifications.html', dataNav: 'notifications' },
    { label: 'Accounts', href: '/admin/accounts.html', dataNav: 'accounts' },
    { label: 'Users', href: '/admin/users.html', dataNav: 'users' },
    { label: 'Audit Trail', href: '/admin/audit.html', dataNav: 'audit' }
    ,{ label: 'AI Assistant', href: '/admin/ai-assistant.html', dataNav: 'ai' }
  ];

  const validNavValues = new Set([...navItems, ...settingsItems].map((item) => item.dataNav));

  const getStoredNav = () => {
    try {
      const stored = localStorage.getItem('business_admin_nav') || localStorage.getItem('saltnum_admin_nav');
      return stored && validNavValues.has(stored) ? stored : null;
    } catch (error) {
      return null;
    }
  };

  const resolveActiveNav = () => {
    const path = window.location.pathname;
    const pathMap = {
      '/admin': 'dashboard',
      '/admin/products': 'products',
      '/admin/products.html': 'products',
      '/admin/inventory': 'inventory',
      '/admin/purchases': 'purchases',
      '/admin/orders': 'orders',
      '/admin/reports': 'reports',
      '/admin/settings': 'settings',
      '/admin/settings.html': 'settings',
      '/admin/company-settings.html': 'company-settings',
      '/admin/company-settings': 'company-settings',
      '/admin/notifications.html': 'notifications',
      '/admin/notifications': 'notifications',
      '/admin/accounts': 'accounts',
      '/admin/accounts.html': 'accounts',
      '/admin/users': 'users',
      '/admin/users.html': 'users',
      '/admin/audit': 'audit',
      '/admin/audit.html': 'audit'
      ,'/admin/ai-assistant': 'ai', '/admin/ai-assistant.html': 'ai'
    };

    const pathMatch = pathMap[path];
    if (pathMatch && validNavValues.has(pathMatch)) {
      return pathMatch;
    }

    const storedNav = getStoredNav();
    const storedMatch = [...navItems, ...settingsItems].find((item) => item.dataNav === storedNav);
    if (storedMatch && (storedMatch.href === path || storedMatch.href === path + '.html')) {
      return storedNav;
    }

    return pathMatch || 'dashboard';
  };

  const ensureSidebarStylesheet = () => {
    if (document.getElementById('admin-sidebar-styles')) return;
    const link = document.createElement('link');
    link.id = 'admin-sidebar-styles';
    link.rel = 'stylesheet';
    link.href = '/admin/sidebar.css';
    document.head.appendChild(link);
  };

  const renderSidebar = async () => {
    const target = document.getElementById('adminSidebar');
    if (!target) return;

    ensureSidebarStylesheet();

    const buildBrandMarkup = (companyName) => {
      const safeCompanyName = String(companyName || 'Business').trim() || 'Business';
      const brandWords = safeCompanyName.split(/\s+/);
      return brandWords.length > 1
        ? brandWords.map((word) => `<span>${word}</span>`).join('')
        : `<span>${safeCompanyName}</span>`;
    };

    const activeNav = resolveActiveNav();
    const renderLink = (item) => `
      <a href="${item.href}" data-nav="${item.dataNav}" class="${item.dataNav === activeNav ? 'active' : ''}" aria-current="${item.dataNav === activeNav ? 'page' : 'false'}">
        <span class="nav-icon"><svg viewBox="0 0 24 24" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round">${icons[item.dataNav] || ''}</svg></span>
        <span class="nav-label">${item.label}</span>
      </a>
    `;

    // Render the nav immediately so it never depends on the company-settings request succeeding.
    target.innerHTML = `
      <div class="brand">${buildBrandMarkup('Business')}</div>
      <nav class="nav" aria-label="Admin navigation">
        <div class="nav-section-label">Main</div>
        ${navItems.map(renderLink).join('')}
        <div class="nav-section-label">Settings</div>
        ${settingsItems.map(renderLink).join('')}
      </nav>
    `;

    fetch('/api/company-settings', { cache: 'no-store' })
      .then((response) => (response.ok ? response.json() : null))
      .then((data) => {
        const companyName = data?.company?.company_name;
        if (!companyName) return;
        const brandEl = target.querySelector('.brand');
        if (brandEl) brandEl.innerHTML = buildBrandMarkup(companyName);
      })
      .catch(() => {
        // Company settings unavailable; keep default brand name
      });

    target.querySelectorAll('a').forEach((link) => {
      const setActive = (navValue) => {
        target.querySelectorAll('a').forEach((anchor) => {
          const isActive = anchor.dataset.nav === navValue;
          anchor.classList.toggle('active', isActive);
          anchor.setAttribute('aria-current', isActive ? 'page' : 'false');
        });
      };

      link.addEventListener('click', () => {
        setActive(link.dataset.nav);
        try {
          localStorage.setItem('business_admin_nav', link.dataset.nav);
        } catch (error) {
          // Ignore localStorage failures; the URL remains the source of truth.
        }
      });
    });
  };

  const ensureSmartSearchStyles = () => {
    if (document.getElementById('smart-search-select-styles')) return;

    const style = document.createElement('style');
    style.id = 'smart-search-select-styles';
    style.textContent = `
      .smart-search-select {
        position: relative;
        width: 100%;
      }
      .smart-search-toggle {
        width: 100%;
        padding: 10px 12px;
        border: 1px solid rgba(148, 163, 184, 0.7);
        border-radius: 10px;
        background: #ffffff;
        color: #0f172a;
        text-align: left;
        font-size: 0.96rem;
        font-weight: 600;
        cursor: pointer;
      }
      .smart-search-toggle::after {
        content: '▾';
        float: right;
        color: #475569;
      }
      .smart-search-menu {
        position: absolute;
        left: 0;
        right: 0;
        top: calc(100% + 6px);
        background: #ffffff;
        border: 1px solid rgba(148, 163, 184, 0.7);
        border-radius: 12px;
        box-shadow: 0 16px 30px rgba(15, 23, 42, 0.12);
        z-index: 1000;
        overflow: hidden;
        display: none;
      }
      .smart-search-menu.open {
        display: block;
      }
      .smart-search-input {
        width: 100%;
        border: none;
        border-bottom: 1px solid rgba(148, 163, 184, 0.35);
        padding: 10px 12px;
        font-size: 0.92rem;
        outline: none;
        background: rgba(248, 250, 252, 0.9);
      }
      .smart-search-options {
        max-height: 220px;
        overflow-y: auto;
        background: #ffffff;
      }
      .smart-search-option {
        width: 100%;
        background: #ffffff;
        border: none;
        text-align: left;
        padding: 10px 12px;
        font-size: 0.94rem;
        color: #0f172a;
        cursor: pointer;
      }
      .smart-search-option:hover,
      .smart-search-option.selected {
        background: rgba(2, 132, 199, 0.08);
      }
      .smart-search-empty {
        padding: 12px;
        color: #64748b;
        font-size: 0.9rem;
      }
      .smart-search-select select {
        display: none;
      }
    `;
    document.head.appendChild(style);
  };

  const applySmartSearch = (select) => {
    if (!select || !(select instanceof HTMLSelectElement)) return;

    const matchesTarget = /product|item|client|vendor|supplier|batch|party/i.test(select.id || '') || /product|item|client|vendor|supplier|batch|party/i.test(select.name || '');
    if (!matchesTarget) return;

    ensureSmartSearchStyles();

    const existingWrapper = select.closest('.smart-search-select');
    const existingButton = existingWrapper?.querySelector('.smart-search-toggle');
    const existingMenu = existingWrapper?.querySelector('.smart-search-menu');
    const existingSearchInput = existingWrapper?.querySelector('.smart-search-input');
    const existingOptionsContainer = existingWrapper?.querySelector('.smart-search-options');

    if (select.dataset.smartSearchEnabled === 'true' && existingButton && existingSearchInput && existingOptionsContainer) {
      const getSelectedText = () => {
        const selectedOption = Array.from(select.options).find((option) => String(option.value) !== '' && String(option.value) === String(select.value));
        return selectedOption?.textContent?.trim() || 'Search';
      };

      const syncDisplay = () => {
        const selectedText = getSelectedText();
        existingButton.textContent = selectedText;
        existingButton.setAttribute('title', selectedText);
        Array.from(existingOptionsContainer.querySelectorAll('.smart-search-option')).forEach((optionNode) => {
          const isSelected = optionNode.dataset.value === String(select.value);
          optionNode.classList.toggle('selected', isSelected);
        });
      };

      const renderOptions = () => {
        const query = existingSearchInput.value.trim().toLowerCase();
        const items = Array.from(select.options).filter((option) => {
          const text = (option.textContent || '').trim();
          return String(option.value) !== '' && (!query || text.toLowerCase().includes(query));
        });

        if (!items.length) {
          existingOptionsContainer.innerHTML = '<div class="smart-search-empty">No match found</div>';
          return;
        }

        existingOptionsContainer.innerHTML = items.map((option) => `
          <button type="button" class="smart-search-option ${String(select.value) === String(option.value) ? 'selected' : ''}" data-value="${option.value}">
            ${option.textContent}
          </button>
        `).join('');

        existingOptionsContainer.querySelectorAll('.smart-search-option').forEach((optionNode) => {
          optionNode.addEventListener('click', () => {
            select.value = optionNode.dataset.value;
            select.dispatchEvent(new Event('change', { bubbles: true }));
            syncDisplay();
            existingMenu.classList.remove('open');
            existingSearchInput.value = '';
            renderOptions();
          });
        });
      };

      syncDisplay();
      renderOptions();
      return;
    }

    if (select.dataset.smartSearchEnabled === 'true') return;

    const wrapper = document.createElement('div');
    wrapper.className = 'smart-search-select';

    const button = document.createElement('button');
    button.type = 'button';
    button.className = 'smart-search-toggle';
    button.textContent = 'Search';
    button.setAttribute('aria-haspopup', 'listbox');

    const menu = document.createElement('div');
    menu.className = 'smart-search-menu';

    const searchInput = document.createElement('input');
    searchInput.type = 'search';
    searchInput.className = 'smart-search-input';
    searchInput.placeholder = 'Search...';
    searchInput.setAttribute('aria-label', 'Search options');

    const optionsContainer = document.createElement('div');
    optionsContainer.className = 'smart-search-options';

    menu.appendChild(searchInput);
    menu.appendChild(optionsContainer);

    const parent = select.parentNode;
    if (parent) {
      parent.insertBefore(wrapper, select);
    }

    wrapper.appendChild(button);
    wrapper.appendChild(menu);
    if (parent) {
      wrapper.appendChild(select);
    }

    select.style.display = 'none';
    select.style.position = 'absolute';
    select.style.width = '0';
    select.style.height = '0';
    select.style.opacity = '0';
    select.style.pointerEvents = 'none';
    select.setAttribute('aria-hidden', 'true');

    const getSelectedText = () => {
      const selectedOption = Array.from(select.options).find((option) => option.selected && String(option.value) !== '');
      if (selectedOption && selectedOption.textContent && selectedOption.textContent.trim()) {
        return selectedOption.textContent.trim();
      }
      if (!select.value || String(select.value) === '') {
        return 'Search';
      }
      const fallback = Array.from(select.options).find((option) => String(option.value) === String(select.value));
      return fallback?.textContent?.trim() || 'Search';
    };

    const syncDisplay = () => {
      const selectedText = getSelectedText();
      button.textContent = selectedText;
      Array.from(optionsContainer.querySelectorAll('.smart-search-option')).forEach((optionNode) => {
        const isSelected = optionNode.dataset.value === String(select.value);
        optionNode.classList.toggle('selected', isSelected);
      });
      button.setAttribute('title', selectedText);
    };

    const renderOptions = () => {
      const query = searchInput.value.trim().toLowerCase();
      const items = Array.from(select.options).filter((option) => {
        const text = (option.textContent || '').trim();
        return !query || text.toLowerCase().includes(query);
      });

      if (!items.length) {
        optionsContainer.innerHTML = '<div class="smart-search-empty">No match found</div>';
        return;
      }

      optionsContainer.innerHTML = items.map((option) => `
        <button type="button" class="smart-search-option ${String(select.value) === String(option.value) ? 'selected' : ''}" data-value="${option.value}">
          ${option.textContent}
        </button>
      `).join('');

      optionsContainer.querySelectorAll('.smart-search-option').forEach((optionNode) => {
        optionNode.addEventListener('click', () => {
          select.value = optionNode.dataset.value;
          select.dispatchEvent(new Event('change', { bubbles: true }));
          syncDisplay();
          menu.classList.remove('open');
          searchInput.value = '';
          renderOptions();
        });
      });
    };

    button.addEventListener('click', (event) => {
      event.stopPropagation();
      const isOpen = menu.classList.contains('open');
      menu.classList.toggle('open', !isOpen);
      if (!isOpen) {
        searchInput.focus();
        renderOptions();
      }
    });

    document.addEventListener('click', (event) => {
      if (!wrapper.contains(event.target)) {
        menu.classList.remove('open');
      }
    });

    searchInput.addEventListener('input', renderOptions);
    select.addEventListener('change', syncDisplay);
    select.dataset.smartSearchEnabled = 'true';
    syncDisplay();
    renderOptions();
  };

  const applySmartSearchToDocument = () => {
    document.querySelectorAll('select').forEach((select) => applySmartSearch(select));
  };

  window.applySmartSearch = applySmartSearch;

  const boot = () => {
    renderSidebar();
    applySmartSearchToDocument();

    if ('MutationObserver' in window) {
      const observer = new MutationObserver(() => {
        // Pause observing while we apply our own DOM updates to avoid an infinite mutation loop.
        observer.disconnect();
        applySmartSearchToDocument();
        observer.observe(document.body, { childList: true, subtree: true });
      });
      observer.observe(document.body, { childList: true, subtree: true });
    }

    window.addEventListener('pageshow', renderSidebar, { passive: true });
    window.addEventListener('popstate', renderSidebar, { passive: true });
  };

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', boot, { once: true });
  } else {
    boot();
  }
})();
