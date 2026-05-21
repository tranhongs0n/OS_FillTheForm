function showNotification(message, type = 'info') {
  let container = document.getElementById('llm-filler-notify-container');
  if (!container) {
    container = document.createElement('div');
    container.id = 'llm-filler-notify-container';
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

  const toast = document.createElement('div');
  toast.style.cssText = `
    padding: 12px 20px;
    border-radius: 8px;
    background: ${type === 'error' ? '#ff4d4f' : type === 'success' ? '#52c41a' : '#1890ff'};
    color: white;
    font-family: sans-serif;
    font-size: 14px;
    box-shadow: 0 4px 12px rgba(0,0,0,0.15);
    transition: all 0.3s ease;
    opacity: 0;
    transform: translateX(20px);
    pointer-events: auto;
  `;
  toast.textContent = message;
  container.appendChild(toast);

  setTimeout(() => {
    toast.style.opacity = '1';
    toast.style.transform = 'translateX(0)';
  }, 10);

  setTimeout(() => {
    toast.style.opacity = '0';
    toast.style.transform = 'translateX(20px)';
    setTimeout(() => toast.remove(), 300);
  }, 4000);
}

function findElement(key) {
  // 1. Try exact match by ID or Name
  let el = document.querySelector(`[id="${key}"], [name="${key}"]`);
  if (el) return el;

  // 2. Try by Label text
  const labels = Array.from(document.querySelectorAll('label'));
  const targetLabel = labels.find(l => l.innerText.trim() === key);
  if (targetLabel && targetLabel.control) return targetLabel.control;
  if (targetLabel && targetLabel.getAttribute('for')) {
    el = document.getElementById(targetLabel.getAttribute('for'));
    if (el) return el;
  }

  // 3. Try fuzzy matching in all inputs
  const allInputs = Array.from(document.querySelectorAll('input, select, textarea, [role="combobox"], .vscomp-wrapper'));
  return allInputs.find(input => {
    const label = input.labels?.[0]?.innerText?.trim() || 
                  input.placeholder || 
                  input.name || 
                  input.id ||
                  input.closest('[data-container]')?.querySelector('label')?.innerText?.trim();
    return label === key;
  });
}

function findSubmitButton(form) {
  if (!form) return null;
  // Standard submit
  let btn = form.querySelector('[type="submit"]');
  if (btn) return btn;

  // Keywords & Primary classes
  const keywords = ['lưu', 'gửi', 'cập nhật', 'xác nhận', 'tạo mới', 'hoàn thành', 'save', 'submit', 'update', 'confirm'];
  const selectors = ['.btn-primary', '.os-btn-primary', 'button.primary', '.ButtonVariant_Primary'];
  
  for (const sel of selectors) {
    btn = form.querySelector(sel);
    if (btn) return btn;
  }

  const allBtns = Array.from(form.querySelectorAll('button, input[type="button"]'));
  return allBtns.find(b => {
    const txt = (b.innerText || b.value || '').toLowerCase();
    return keywords.some(k => txt.includes(k));
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan_form") {
    showNotification("Đang quét trang...");
    
    const isInternalInput = el => {
      return el.classList.contains('vscomp-search-input') || 
             (el.classList.contains('input') && el.closest('.osui-datepicker')) ||
             el.classList.contains('flatpickr-mobile');
    };

    const mapField = el => {
      const field = {
        label: el.labels?.[0]?.innerText?.trim() || 
               el.placeholder || 
               el.name || 
               el.id || 
               el.closest('[data-container], .form-group')?.querySelector('label')?.innerText?.trim() ||
               "Unnamed Field",
        name: el.name,
        id: el.id,
        type: el.tagName === 'SELECT' ? 'select' : el.type || (el.classList.contains('vscomp-wrapper') ? 'virtual-select' : 'text')
      };

      if (el.tagName === 'SELECT') {
        field.options = Array.from(el.options).map(o => ({ text: o.innerText, value: o.value })).filter(o => o.value);
      } else if (el.classList.contains('vscomp-wrapper')) {
        // Try to find options for Virtual Select
        const hiddenSelect = el.querySelector('select');
        if (hiddenSelect) {
          field.options = Array.from(hiddenSelect.options).map(o => ({ text: o.innerText, value: o.value })).filter(o => o.value);
        } else {
          // Look for portal or child options
          const dropboxId = el.id ? `vscomp-dropbox-container-${el.id.split('-').pop()}` : null;
          const dropbox = dropboxId ? document.getElementById(dropboxId) : el.querySelector('.vscomp-options-container');
          
          if (dropbox) {
             field.options = Array.from(dropbox.querySelectorAll('.vscomp-option')).map(opt => ({
               text: opt.querySelector('.vscomp-option-text')?.innerText?.trim() || opt.innerText?.trim(),
               value: opt.getAttribute('data-value')
             })).filter(o => o.value);
          } else {
             // Ultimate fallback: scan whole document for this specific structure if it's the only one
             const allOpts = Array.from(document.querySelectorAll('.vscomp-option')).map(opt => ({
               text: opt.querySelector('.vscomp-option-text')?.innerText?.trim() || opt.innerText?.trim(),
               value: opt.getAttribute('data-value')
             })).filter(o => o.value);
             field.options = allOpts.length > 0 ? allOpts : [];
          }
        }
      }
      return field;
    };

    const fields = Array.from(document.querySelectorAll('input, select, textarea, .vscomp-wrapper'))
      .filter(el => !isInternalInput(el))
      .map(mapField);

    // Grouping logic
    const forms = Array.from(document.forms).map((form, i) => ({
      name: form.name || form.id || `Form ${i+1}`,
      fields: fields.filter(f => {
        // Find actual element to check its parent form
        let el = document.getElementById(f.id);
        if (!el && f.name) el = document.getElementsByName(f.name)[0];
        return el && el.closest('form') === form;
      })
    })).filter(f => f.fields.length > 0);

    const orphans = fields.filter(f => {
      let el = document.getElementById(f.id);
      if (!el && f.name) el = document.getElementsByName(f.name)[0];
      // vscomp-wrapper might not be in a form, or inputs might be outside
      return !el || !el.closest('form');
    });

    if (orphans.length > 0) {
      forms.push({ name: "Detached Fields", fields: orphans });
    }

    sendResponse({ forms });
  } else if (request.action === "apply_data") {
    (async () => {
      try {
        const json = JSON.parse(request.json);
        let fillCount = 0;
        let lastEl = null;

        for (const [key, val] of Object.entries(json)) {
          const el = findElement(key);
          if (!el) continue;

          if (el.classList.contains('vscomp-wrapper')) {
            el.click(); // Open dropdown
            
            // Wait for options to render (polling up to 2 seconds)
            let match = null;
            let retries = 20; // 20 * 100ms = 2s max wait
            
            while (retries > 0 && !match) {
              await new Promise(r => setTimeout(r, 100));
              const options = Array.from(document.querySelectorAll('.vscomp-option'));
              match = options.find(o => o.innerText.trim() === val || o.getAttribute('data-value') === val);
              retries--;
            }

            if (match) {
              match.click();
              fillCount++;
            } else {
              el.click(); // Close if not found after wait
            }
          } else {
            if (el.tagName === 'SELECT') {
              const opt = Array.from(el.options).find(o => o.value == val || o.innerText == val);
              if (opt) el.value = opt.value;
            } else if (el.type === 'checkbox' || el.type === 'radio') {
              el.checked = !!val;
            } else {
              el.value = val;
              if (el.classList.contains('flatpickr-input')) {
                if (el._flatpickr) {
                  el._flatpickr.setDate(val, true);
                } else {
                  // Fallback for OutSystems: update the visible fake input sibling
                  const wrapper = el.closest('.osui-datepicker') || el.closest('.input-date');
                  if (wrapper) {
                    const visibleInput = wrapper.querySelector('input:not(.flatpickr-input)');
                    if (visibleInput) {
                      // Attempt to format to common display format (DD/MM/YYYY) or just pass val
                      const parts = val.split('-');
                      if (parts.length === 3) {
                        visibleInput.value = `${parts[2]}/${parts[1]}/${parts[0]}`; // DD/MM/YYYY
                      } else {
                        visibleInput.value = val;
                      }
                      visibleInput.dispatchEvent(new Event('input', { bubbles: true }));
                      visibleInput.dispatchEvent(new Event('change', { bubbles: true }));
                      visibleInput.dispatchEvent(new Event('blur', { bubbles: true }));
                    }
                  }
                }
              }
            }

            el.dispatchEvent(new Event('focus', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            fillCount++;
          }
          lastEl = el;
        }

        showNotification(`Đã điền ${fillCount} trường thành công!`, "success");

        if (request.submit && lastEl) {
          const form = lastEl.form || lastEl.closest('form') || lastEl.closest('.form-container');
          const btn = findSubmitButton(form);
          if (btn) btn.click();
          else if (form && form.submit) form.submit();
        }
      } catch (e) {
        showNotification("Lỗi: " + e.message, "error");
      }
    })();
  } else if (request.action === "notify") {
    showNotification(request.message, request.type);
  }
});
