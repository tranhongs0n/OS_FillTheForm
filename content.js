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
    background: ${type === 'error' ? '#ff4d4f' : '#1890ff'};
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
  let el = document.querySelector(`[id="${key}"], [name="${key}"]`);
  if (el) return el;

  const vsWrappers = Array.from(document.querySelectorAll('.vscomp-wrapper'));
  el = vsWrappers.find(w => {
    const label = w.closest('[data-container], .form-group')?.querySelector('label')?.innerText?.trim();
    return label === key || w.id === key;
  });
  if (el) return el;

  const allInputs = Array.from(document.querySelectorAll('input, select, textarea'));
  el = allInputs.find(input => {
    const label = input.labels?.[0]?.innerText?.trim();
    return label === key || input.placeholder === key || input.name === key || input.id === key;
  });
  
  return el;
}

function findSubmitButton(form) {
  if (!form) return null;
  let btn = form.querySelector('[type="submit"]');
  if (btn) return btn;

  const primaryClasses = ['.btn-primary', '.os-btn-primary', '.ButtonVariant_Primary', '.primary'];
  for (const cls of primaryClasses) {
    btn = form.querySelector(cls);
    if (btn) return btn;
  }

  const keywords = ['lưu', 'gửi', 'cập nhật', 'xác nhận', 'tạo mới', 'hoàn thành', 'đồng ý', 'thay đổi', 'save', 'submit', 'update', 'confirm', 'create'];
  const allButtons = Array.from(form.querySelectorAll('button, input[type="button"]'));
  
  for (const keyword of keywords) {
    const found = allButtons.find(b => {
      const text = (b.innerText || b.value || '').toLowerCase();
      return text.includes(keyword);
    });
    if (found) return found;
  }

  return form.querySelector('button:not([type="button"])');
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan_form") {
    showNotification("Đang quét form...");
    
    const mapField = el => ({
      label: el.labels?.[0]?.innerText?.trim() || el.placeholder || el.name || el.id,
      name: el.name,
      id: el.id,
      type: el.tagName === 'SELECT' ? 'select' : el.type
    });

    const getSelectOptions = el => Array.from(el.options).map(opt => ({
      text: opt.innerText,
      value: opt.value
    })).filter(opt => opt.value !== "");

    // 1. Scan standard forms
    const forms = Array.from(document.forms).map((form, index) => ({
      name: form.name || form.id || `Form ${index + 1}`,
      fields: Array.from(form.querySelectorAll('input, select, textarea'))
        .filter(el => !el.classList.contains('vscomp-search-input')) // Skip internal inputs
        .map(el => {
          const field = mapField(el);
          if (el.tagName === 'SELECT') field.options = getSelectOptions(el);
          return field;
        })
    }));

    // 2. Scan Virtual Selects
    const vsFields = Array.from(document.querySelectorAll('.vscomp-wrapper')).map(el => {
      const label = el.closest('[data-container], .form-group')?.querySelector('label')?.innerText?.trim() || "Virtual Dropdown";
      const dropboxId = el.id ? `vscomp-dropbox-container-${el.id.split('-').pop()}` : null;
      const dropbox = dropboxId ? document.getElementById(dropboxId) : null;
      const options = Array.from((dropbox || document).querySelectorAll('.vscomp-option')).map(opt => ({
        text: opt.querySelector('.vscomp-option-text')?.innerText?.trim() || opt.innerText?.trim(),
        value: opt.getAttribute('data-value')
      }));

      return {
        label,
        id: el.id,
        type: 'virtual-select',
        options: options
      };
    });

    if (vsFields.length > 0) {
      forms.push({ name: "Custom Dropdowns", fields: vsFields });
    }

    // 3. Scan orphans
    const allInputs = Array.from(document.querySelectorAll('input, select, textarea'))
      .filter(el => !el.form && !el.classList.contains('vscomp-search-input'));
    const orphans = allInputs.map(el => {
      const field = mapField(el);
      if (el.tagName === 'SELECT') field.options = getSelectOptions(el);
      return field;
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
        let lastFilledEl = null;

        for (const [key, val] of Object.entries(json)) {
          const el = findElement(key);
          if (!el) continue;

          if (el.classList.contains('vscomp-wrapper')) {
            // Virtual Select Handling
            el.click(); // Open
            await new Promise(r => setTimeout(r, 200)); // Wait for animation
            const dropboxId = el.id ? `vscomp-dropbox-container-${el.id.split('-').pop()}` : null;
            const dropbox = dropboxId ? document.getElementById(dropboxId) : document;
            const option = Array.from(dropbox.querySelectorAll('.vscomp-option')).find(opt => 
              opt.getAttribute('data-value') == val || 
              opt.innerText.trim() == val ||
              opt.querySelector('.vscomp-option-text')?.innerText?.trim() == val
            );
            if (option) {
              option.click();
              fillCount++;
            } else {
              el.click(); // Close if not found
            }
          } else {
            if (el.tagName === 'SELECT') {
              const option = Array.from(el.options).find(opt => opt.value == val || opt.innerText == val);
              if (option) el.value = option.value;
            } else if (el.type === 'checkbox' || el.type === 'radio') {
               el.checked = !!val;
            } else {
              el.value = val;
            }
            
            el.dispatchEvent(new Event('focus', { bubbles: true }));
            el.dispatchEvent(new Event('input', { bubbles: true }));
            el.dispatchEvent(new Event('change', { bubbles: true }));
            el.dispatchEvent(new Event('blur', { bubbles: true }));
            fillCount++;
          }
          lastFilledEl = el;
        }
        
        showNotification(`Đã điền ${fillCount} trường dữ liệu thành công!`, "success");

        if (request.submit && lastFilledEl) {
          const form = lastFilledEl.form || lastFilledEl.closest('form') || lastFilledEl.closest('.form-container');
          if (form) {
            const submitBtn = findSubmitButton(form);
            if (submitBtn) {
              showNotification(`Đang tự động submit via: ${submitBtn.innerText || submitBtn.value || 'Button'}...`);
              submitBtn.click();
            } else if (form.submit) {
              showNotification("Đang tự động submit via form.submit()...");
              form.submit();
            }
          }
        }
      } catch (e) {
        showNotification("Lỗi khi điền dữ liệu: " + e.message, "error");
      }
    })();
  } else if (request.action === "notify") {
    showNotification(request.message, request.type);
  }
});
