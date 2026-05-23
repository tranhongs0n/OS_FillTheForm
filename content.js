/**
 * Enterprise LLM Auto-Filler Suite - Content Script
 * 
 * Modular content script scanning web forms (supporting virtual selects and complex controls),
 * applying structured data fields, and rendering in-page toast notifications.
 */

// Content Script Configurations
const CONFIG = {
  NOTIFICATION_CONTAINER_ID: 'llm-filler-notify-container',
  NOTIFICATION_TIMEOUT_MS: 4000,
  TOAST_ANIMATION_MS: 300,
  
  // Custom triggers matching complex SPA controls
  VIRTUAL_SELECT_SELECTOR: '.vscomp-wrapper',
  
  // Submit matching keywords and primary selectors
  SUBMIT_KEYWORDS: ['lưu', 'gửi', 'cập nhật', 'xác nhận', 'tạo mới', 'hoàn thành', 'save', 'submit', 'update', 'confirm'],
  PRIMARY_BUTTON_SELECTORS: ['.btn-primary', '.os-btn-primary', 'button.primary', '.ButtonVariant_Primary'],
  
  // Sibling selector offsets to scrape headings
  HEADING_SCAN_LIMIT: 3
};

// Custom theme colors for Toast notifications
const TOAST_THEMES = {
  info: { color: '#1890ff', text: 'white' },
  success: { color: '#52c41a', text: 'white' },
  error: { color: '#ff4d4f', text: 'white' }
};

// -------------------------------------------------------------------------
// Floating Toast Notification
// -------------------------------------------------------------------------

function showNotification(message, type = 'info') {
  let container = document.getElementById(CONFIG.NOTIFICATION_CONTAINER_ID);
  if (!container) {
    container = document.createElement('div');
    container.id = CONFIG.NOTIFICATION_CONTAINER_ID;
    container.style.cssText = `
      position: fixed;
      top: 20px;
      right: 20px;
      z-index: 999999;
      display: flex;
      flex-direction: column;
      gap: 10px;
      pointer-events: none;
    `;
    document.body.appendChild(container);
  }

  const theme = TOAST_THEMES[type] || TOAST_THEMES.info;
  const toast = document.createElement('div');
  
  toast.style.cssText = `
    padding: 12px 20px;
    border-radius: 8px;
    background: ${theme.color};
    color: ${theme.text};
    font-family: 'Inter', sans-serif, system-ui;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transition: all 0.3s ease;
    opacity: 0;
    transform: translateX(20px);
    pointer-events: auto;
  `;
  toast.textContent = message;
  container.appendChild(toast);

  // Animate slide-in
  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  }, 10);

  // Schedule fade-out and destruction
  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), CONFIG.TOAST_ANIMATION_MS);
  }, CONFIG.NOTIFICATION_TIMEOUT_MS);
}

// -------------------------------------------------------------------------
// DOM Traversal & Label Extraction
// -------------------------------------------------------------------------

function getLabelFor(el) {
  if (el.labels && el.labels.length > 0) {
    return el.labels[0].innerText.trim();
  }
  
  // Fallbacks checklist
  return (
    getOutSystemsLabelFallback(el) ||
    getParentLabelFallback(el) ||
    getModalHeaderFallback(el) ||
    el.placeholder || 
    el.name || 
    el.id || 
    "Unnamed Field"
  );
}

function getOutSystemsLabelFallback(el) {
  // Sibling data-containers pattern inside OutSystems
  const container = el.closest('[data-container]');
  if (container && container.previousElementSibling) {
    const prevText = container.previousElementSibling.innerText?.trim();
    if (prevText) return prevText;
  }
  return null;
}

function getParentLabelFallback(el) {
  // Check direct parent wrappers
  if (el.parentElement && el.parentElement.previousElementSibling && el.parentElement.previousElementSibling.tagName === 'LABEL') {
    return el.parentElement.previousElementSibling.innerText.trim();
  }

  if (el.parentElement && el.parentElement.tagName === 'SPAN') {
    const prevSibling = el.parentElement.previousElementSibling;
    if (prevSibling && prevSibling.tagName === 'LABEL') {
      return prevSibling.innerText.trim();
    }
  }

  const wrapper = el.closest('.form-group, .display-flex, .OSBlockWidget');
  if (wrapper) {
    const lbl = wrapper.querySelector('label');
    if (lbl && lbl.innerText) return lbl.innerText.trim();
    
    const spanLbl = wrapper.querySelector('[data-label] span, .control-label span');
    if (spanLbl && spanLbl.innerText) return spanLbl.innerText.trim();
  }

  // Preceding sibling fallback
  if (el.previousElementSibling && el.previousElementSibling.innerText) {
     const text = el.previousElementSibling.innerText.trim();
     if (text && text.length < 50) return text;
  }
  return null;
}

function getModalHeaderFallback(el) {
  const popup = el.closest('.popup-dialog, [role="dialog"], .osui-popup');
  if (popup) {
     const title = popup.querySelector('.title-popup, [id*="-Title"], .popup-title');
     if (title && title.innerText) {
         const fallbackName = el.placeholder || el.name || el.id || "Field";
         return `${title.innerText.trim()} - ${fallbackName}`;
     }
  }
  return null;
}

// -------------------------------------------------------------------------
// Input Location & Selection
// -------------------------------------------------------------------------

function findElement(key) {
  if (!key) return null;

  // 1. Exact match by ID using safe getElementById
  let el = document.getElementById(key);
  if (el) return el;

  // Try exact match by Name
  const namedElements = document.getElementsByName(key);
  if (namedElements.length > 0) return namedElements[0];

  // Try querySelector utilizing safe CSS escaping
  try {
    const escapedKey = CSS.escape(key);
    el = document.querySelector(`[id="${escapedKey}"], [name="${escapedKey}"]`);
    if (el) return el;
  } catch (e) {
    // Suppress selector parser errors
  }

  // 2. Exact match by Label control
  const labels = Array.from(document.querySelectorAll('label'));
  const targetLabel = labels.find(l => l.innerText.trim() === key);
  if (targetLabel && targetLabel.control) return targetLabel.control;
  if (targetLabel && targetLabel.getAttribute('for')) {
    el = document.getElementById(targetLabel.getAttribute('for'));
    if (el) return el;
  }

  // 3. Fuzzy matching inside all query-able fields
  const allInputs = Array.from(document.querySelectorAll(`input, select, textarea, [role="combobox"], ${CONFIG.VIRTUAL_SELECT_SELECTOR}`));
  return allInputs.find(input => getLabelFor(input) === key);
}

function findSubmitButton(form) {
  if (!form) return null;
  
  const scope = form.closest('[role="dialog"], .popup-dialog, .osui-popup') || form;

  const isClickable = (btn) => {
    return btn && 
           btn.offsetParent !== null && 
           !btn.classList.contains('display-none') && 
           !btn.disabled &&
           btn.getAttribute('aria-hidden') !== 'true' &&
           btn.getAttribute('tabindex') !== '-1';
  };

  // Try primary CSS selector configurations
  let btn = null;
  for (const selector of CONFIG.PRIMARY_BUTTON_SELECTORS) {
    btn = scope.querySelector(selector);
    if (isClickable(btn)) return btn;
  }

  // Fallback to searching keywords
  const allBtns = Array.from(scope.querySelectorAll('button, input[type="button"]')).filter(isClickable);
  return allBtns.find(b => {
    const txt = (b.innerText || b.value || '').toLowerCase();
    return CONFIG.SUBMIT_KEYWORDS.some(k => txt.includes(k));
  });
}

// -------------------------------------------------------------------------
// Extension Runtime Messages Router
// -------------------------------------------------------------------------

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "captureContext") {
    handleCaptureContextRequest(sendResponse);
    return false;
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan_form") {
    handleFormScanRequest(sendResponse);
    return true; // async channel open
  } else if (request.action === "apply_data") {
    handleApplyDataRequest(request);
  } else if (request.action === "notify") {
    showNotification(request.message, request.type);
  }
});

// -------------------------------------------------------------------------
// Action Routines
// -------------------------------------------------------------------------

function handleCaptureContextRequest(sendResponse) {
  try {
    const fields = Array.from(document.querySelectorAll('input, textarea')).map(el => {
        const label = document.querySelector(`label[for="${el.id}"]`)?.innerText || el.placeholder || "";
        return { label, type: el.type, id: el.id, name: el.name };
    });
    sendResponse({
      url: window.location.href,
      title: document.title,
      fields
    });
  } catch (e) {
    sendResponse({ error: e.message });
  }
}

function handleFormScanRequest(sendResponse) {
  showNotification("Đang quét trang...");
  
  chrome.storage.local.get(['customSelectors'], (result) => {
    try {
      const customSelectors = result.customSelectors || [];
      const vsSelectors = customSelectors.filter(s => s.type === 'Virtual Select').map(s => s.selector);
      const dpSelectors = customSelectors.filter(s => s.type === 'DatePicker').map(s => s.selector);
      const stdSelectors = customSelectors.filter(s => s.type === 'Standard').map(s => s.selector);
      
      const vsSelectorQuery = vsSelectors.length > 0 ? vsSelectors.join(', ') : CONFIG.VIRTUAL_SELECT_SELECTOR;
      
      // Construct selector query string
      let selectorStr = 'input, select, textarea, ' + vsSelectorQuery;
      if (stdSelectors.length > 0) {
        selectorStr += ', ' + stdSelectors.join(', ');
      }
      
      const isInternalInput = el => {
        const isVsInternal = el.classList.contains('vscomp-search-input') || 
                             el.classList.contains('vscomp-hidden-input');
        const isDpInternal = (el.classList.contains('input') && el.closest('.osui-datepicker')) || 
                             el.classList.contains('flatpickr-mobile');
                             
        // Check custom datepicker selectors
        let isCustomDpInternal = false;
        dpSelectors.forEach(sel => {
          if (el.closest(sel)) {
            isCustomDpInternal = true;
          }
        });
        
        return el.type === 'file' || isVsInternal || isDpInternal || isCustomDpInternal;
      };

      const mapField = el => {
        const isVs = el.matches(vsSelectorQuery);
        const field = {
          label: getLabelFor(el),
          name: el.name,
          id: el.id,
          type: el.tagName === 'SELECT' ? 'select' : el.type || (isVs ? 'virtual-select' : 'text')
        };

        if (el.tagName === 'SELECT') {
          field.options = Array.from(el.options).map(o => ({ text: o.innerText, value: o.value })).filter(o => o.value);
        } else if (isVs) {
          field.options = getVirtualSelectOptions(el);
        }
        return field;
      };

      // Scrape forms cleanly utilizing direct element filtering references
      const fieldsElements = Array.from(document.querySelectorAll(selectorStr))
        .filter(el => !isInternalInput(el) && el.type !== 'hidden');

      const forms = Array.from(document.forms).map((form, i) => {
        const formFields = fieldsElements.filter(el => el.closest('form') === form);
        return {
          name: form.name || form.id || `Form ${i+1}`,
          fields: formFields.map(mapField)
        };
      }).filter(f => f.fields.length > 0);

      const pageContext = {
        title: document.title,
        mainHeadings: Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 5).map(h => h.innerText.trim()).filter(t => t),
      };

      // Attach form headlines context
      forms.forEach(formObj => {
        const formEl = document.querySelector(`form[name="${formObj.name}"], form[id="${formObj.name}"]`);
        if (formEl) {
          formObj.context = scrapeFormContextHeadings(formEl);
        }
      });

      sendResponse({ pageContext, forms });
    } catch (e) {
      showNotification("Lỗi quét form: " + e.message, "error");
      sendResponse({ error: e.message });
    }
  });
}

function getVirtualSelectOptions(el) {
  const hiddenSelect = el.querySelector('select');
  if (hiddenSelect) {
    return Array.from(hiddenSelect.options).map(o => ({ text: o.innerText, value: o.value })).filter(o => o.value);
  }
  
  const dropboxId = el.id ? `vscomp-dropbox-container-${el.id.split('-').pop()}` : null;
  const dropbox = dropboxId ? document.getElementById(dropboxId) : el.querySelector('.vscomp-options-container');
  
  const targetContainer = dropbox || document;
  const options = Array.from(targetContainer.querySelectorAll('.vscomp-option'));
  
  return options.map(opt => ({
    text: opt.querySelector('.vscomp-option-text')?.innerText?.trim() || opt.innerText?.trim(),
    value: opt.getAttribute('data-value')
  })).filter(o => o.value);
}

function scrapeFormContextHeadings(formEl) {
  const internalHeadings = Array.from(formEl.querySelectorAll('h1, h2, h3, h4, h5, .title, .heading')).map(h => h.innerText.trim()).filter(t => t);
  let previousEl = formEl.previousElementSibling;
  const externalHeadings = [];
  
  for (let i = 0; i < CONFIG.HEADING_SCAN_LIMIT && previousEl; i++) {
     if (['H1','H2','H3','H4','H5'].includes(previousEl.tagName) || previousEl.classList.contains('title')) {
       externalHeadings.push(previousEl.innerText.trim());
     }
     previousEl = previousEl.previousElementSibling;
  }
  return [...externalHeadings, ...internalHeadings].slice(0, 3).join(" | ");
}

async function handleApplyDataRequest(request) {
  try {
    const json = JSON.parse(request.json);
    let fillCount = 0;
    let lastEl = null;

    for (const [key, val] of Object.entries(json)) {
      const el = findElement(key);
      if (!el) continue;

      if (el.classList.contains('vscomp-wrapper')) {
        await fillVirtualSelect(el, val);
      } else {
        fillStandardField(el, val);
      }
      
      triggerInputEvents(el);
      fillCount++;
      lastEl = el;
    }

    showNotification(`Đã điền ${fillCount} trường thành công!`, "success");
    
    if (request.submit && lastEl) {
      triggerFormSubmit(lastEl);
    }
  } catch (e) {
    showNotification("Lỗi điền form: " + e.message, "error");
  }
}

async function fillVirtualSelect(el, val) {
  const toggleBtn = el.querySelector('.vscomp-toggle-button') || el;
  await new Promise(r => requestAnimationFrame(() => r()));
  toggleBtn.click(); // Open dropdown
  
  let match = null;
  let retries = 20;
  
  while (retries > 0 && !match) {
    await new Promise(r => setTimeout(r, 100));
    
    const dropboxId = el.id ? `vscomp-dropbox-container-${el.id.split('-').pop()}` : null;
    const dropbox = dropboxId ? document.getElementById(dropboxId) : document.querySelector('.vscomp-options-container');
    
    if (dropbox && dropbox.offsetParent !== null) {
      const options = Array.from(dropbox.querySelectorAll('.vscomp-option'));
      const searchVal = String(val).toLowerCase();
      match = options.find(o => {
        const text = o.innerText.trim().toLowerCase();
        const dVal = (o.getAttribute('data-value') || '').toLowerCase();
        return text === searchVal || dVal === searchVal || text.includes(searchVal);
      });
    }
    retries--;
  }

  if (match) {
    match.click();
  } else {
    // Close if opened but not selected
    const dropboxId = el.id ? `vscomp-dropbox-container-${el.id.split('-').pop()}` : null;
    const dropbox = dropboxId ? document.getElementById(dropboxId) : document.querySelector('.vscomp-options-container');
    if (dropbox && dropbox.offsetParent !== null) {
      toggleBtn.click();
    }
  }
  
  await new Promise(r => setTimeout(r, 200));
}

function fillStandardField(el, val) {
  if (el.tagName === 'SELECT') {
    const opt = Array.from(el.options).find(o => o.value == val || o.innerText == val);
    if (opt) el.value = opt.value;
  } else if (el.type === 'checkbox' || el.type === 'radio') {
    const targetState = (val === true || String(val).toLowerCase() === 'true' || val === 1 || val === '1');
    if (el.type === 'checkbox') {
      if (el.checked !== targetState) el.click();
    } else if (el.type === 'radio') {
      if (targetState && !el.checked) el.click();
    }
  } else {
    el.value = val;
    if (el.classList.contains('flatpickr-input')) {
      fillFlatpickrFallback(el, val);
    }
  }
}

function fillFlatpickrFallback(el, val) {
  if (el._flatpickr) {
    el._flatpickr.setDate(val, true);
  } else {
    const wrapper = el.closest('.osui-datepicker') || el.closest('.input-date');
    if (wrapper) {
      const visibleInput = wrapper.querySelector('input.form-control:not(.flatpickr-input), input.input:not(.flatpickr-input)');
      if (visibleInput) {
        const parts = val.split('-');
        if (parts.length === 3) {
          visibleInput.value = `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
        } else {
          visibleInput.value = val;
        }
        triggerInputEvents(visibleInput);
      }
    }
  }
}

function triggerInputEvents(el) {
  el.dispatchEvent(new Event('focus', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
  el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter' }));
  el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
}

function triggerFormSubmit(lastEl) {
  const form = lastEl.form || lastEl.closest('form') || lastEl.closest('.form-container');
  if (form) {
    const btn = findSubmitButton(form);
    if (btn) {
      showNotification(`Đang tự động submit via: ${btn.innerText || btn.value || 'Button'}...`);
      btn.click();
    } else if (form.submit) {
      showNotification("Đang tự động submit via form.submit()...");
      form.submit();
    }
  }
}
