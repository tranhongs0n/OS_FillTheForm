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

  const allInputs = Array.from(document.querySelectorAll('input, select, textarea'));
  el = allInputs.find(input => {
    const label = input.labels?.[0]?.innerText?.trim();
    return label === key || input.placeholder === key || input.name === key || input.id === key;
  });
  
  return el;
}

function findSubmitButton(form) {
  if (!form) return null;

  // 1. Explicit submit type
  let btn = form.querySelector('[type="submit"]');
  if (btn) return btn;

  // 2. Common primary classes
  const primaryClasses = ['.btn-primary', '.os-btn-primary', '.ButtonVariant_Primary', '.primary'];
  for (const cls of primaryClasses) {
    btn = form.querySelector(cls);
    if (btn) return btn;
  }

  // 3. Keywords in text
  const keywords = ['lưu', 'gửi', 'cập nhật', 'xác nhận', 'tạo mới', 'hoàn thành', 'đồng ý', 'thay đổi', 'save', 'submit', 'update', 'confirm', 'create'];
  const allButtons = Array.from(form.querySelectorAll('button, input[type="button"]'));
  
  for (const keyword of keywords) {
    const found = allButtons.find(b => {
      const text = (b.innerText || b.value || '').toLowerCase();
      return text.includes(keyword);
    });
    if (found) return found;
  }

  // 4. Fallback to any button that isn't explicitly "button" type
  return form.querySelector('button:not([type="button"])');
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan_form") {
    showNotification("Đang quét form...");
    const mapField = el => {
      const field = {
        label: el.labels?.[0]?.innerText?.trim() || el.placeholder || el.name || el.id,
        name: el.name,
        id: el.id,
        type: el.type
      };
      if (el.tagName === 'SELECT') {
        field.options = Array.from(el.options).map(opt => ({
          text: opt.innerText,
          value: opt.value
        })).filter(opt => opt.value !== "");
      }
      return field;
    };

    const forms = Array.from(document.forms).map((form, index) => ({
      name: form.name || form.id || `Form ${index + 1}`,
      fields: Array.from(form.querySelectorAll('input, select, textarea')).map(mapField)
    }));

    const allInputs = Array.from(document.querySelectorAll('input, select, textarea'));
    const orphans = allInputs.filter(el => !el.form).map(mapField);

    if (orphans.length > 0) {
      forms.push({ name: "Detached Fields", fields: orphans });
    }

    sendResponse({ forms });
  } else if (request.action === "apply_data") {
    try {
      const json = JSON.parse(request.json);
      let fillCount = 0;
      let lastFilledEl = null;

      for (const [key, val] of Object.entries(json)) {
        const el = findElement(key);
        if (el) {
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
          lastFilledEl = el;
        }
      }
      
      showNotification(`Đã điền ${fillCount} trường dữ liệu thành công!`, "success");

      if (request.submit && lastFilledEl) {
        const form = lastFilledEl.form;
        if (form) {
          const submitBtn = findSubmitButton(form);
          if (submitBtn) {
            showNotification(`Đang tự động submit via: ${submitBtn.innerText || submitBtn.value || 'Button'}...`);
            submitBtn.click();
          } else {
            showNotification("Đang tự động submit via form.submit()...");
            form.submit();
          }
        }
      }
    } catch (e) {
      showNotification("Lỗi khi điền dữ liệu: " + e.message, "error");
    }
  } else if (request.action === "notify") {
    showNotification(request.message, request.type);
  }
});
