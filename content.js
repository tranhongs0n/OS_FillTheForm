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

function getLabelFor(el) {
  if (el.labels && el.labels.length > 0) return el.labels[0].innerText.trim();
  
  // Specific OutSystems pattern: sibling data-containers
  const container = el.closest('[data-container]');
  if (container && container.previousElementSibling) {
    const prevText = container.previousElementSibling.innerText?.trim();
    if (prevText) return prevText; // Picks up spans, divs, or labels inside the previous container
  }

  // Handle span or div wrapping the input right under the label container
  if (el.parentElement && el.parentElement.previousElementSibling && el.parentElement.previousElementSibling.tagName === 'LABEL') {
    return el.parentElement.previousElementSibling.innerText.trim();
  }

  // Handle case where label is a sibling of the wrapper span
  if (el.parentElement && el.parentElement.tagName === 'SPAN') {
      const prevSibling = el.parentElement.previousElementSibling;
      if (prevSibling && prevSibling.tagName === 'LABEL') {
          return prevSibling.innerText.trim();
      }
  }

  // Look in common wrapper parents for labels or spans that look like labels
  const wrapper = el.closest('.form-group, .display-flex, .OSBlockWidget');
  if (wrapper) {
    const lbl = wrapper.querySelector('label');
    if (lbl && lbl.innerText) return lbl.innerText.trim();
    
    // OutSystems fallback: span inside a label-container
    const spanLbl = wrapper.querySelector('[data-label] span, .control-label span');
    if (spanLbl && spanLbl.innerText) return spanLbl.innerText.trim();
  }

  // General fallback: Look at the immediately preceding sibling text
  if (el.previousElementSibling && el.previousElementSibling.innerText) {
     const text = el.previousElementSibling.innerText.trim();
     if (text && text.length < 50) return text; // Arbitrary length check to avoid grabbing huge paragraphs
  }

  // Modal Header fallback: Look up for a popup title
  const popup = el.closest('.popup-dialog, [role="dialog"], .osui-popup');
  if (popup) {
     const title = popup.querySelector('.title-popup, [id*="-Title"], .popup-title');
     if (title && title.innerText) {
         // Combine popup title with placeholder/name for better context
         const fallback = el.placeholder || el.name || el.id || "Field";
         return `${title.innerText.trim()} - ${fallback}`;
     }
  }

  // Fallbacks: Try to find something descriptive
  return el.placeholder || el.name || el.id || "Unnamed Field";
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
    return getLabelFor(input) === key;
  });
}

function findSubmitButton(form) {
  if (!form) return null;
  
  // Extend search scope if inside a popup/dialog because buttons might be outside the <form>
  const scope = form.closest('[role="dialog"], .popup-dialog, .osui-popup') || form;

  const isClickable = (btn) => {
    return btn && 
           btn.offsetParent !== null && 
           !btn.classList.contains('display-none') && 
           !btn.disabled &&
           btn.getAttribute('aria-hidden') !== 'true' &&
           btn.getAttribute('tabindex') !== '-1';
  };

  let btn = scope.querySelector('[type="submit"]');
  if (isClickable(btn)) return btn;

  const primaryClasses = ['.btn-primary', '.os-btn-primary', 'button.primary', '.ButtonVariant_Primary'];
  for (const sel of primaryClasses) {
    btn = scope.querySelector(sel);
    if (isClickable(btn)) return btn;
  }

  const keywords = ['lưu', 'gửi', 'cập nhật', 'xác nhận', 'tạo mới', 'hoàn thành', 'save', 'submit', 'update', 'confirm'];
  const allBtns = Array.from(scope.querySelectorAll('button, input[type="button"]')).filter(isClickable);
  return allBtns.find(b => {
    const txt = (b.innerText || b.value || '').toLowerCase();
    return keywords.some(k => txt.includes(k));
  });
}

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "captureContext") {
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
    return false; // Sync response
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan_form") {
    showNotification("Đang quét trang...");
    
    try {
      const isInternalInput = el => {
        return el.type === 'file' || 
               el.classList.contains('vscomp-search-input') || 
               el.classList.contains('vscomp-hidden-input') ||
               (el.classList.contains('input') && el.closest('.osui-datepicker')) ||
               el.classList.contains('flatpickr-mobile');
      };

      const mapField = el => {
        const field = {
          label: getLabelFor(el),
          name: el.name,
          id: el.id,
          type: el.tagName === 'SELECT' ? 'select' : el.type || (el.classList.contains('vscomp-wrapper') ? 'virtual-select' : 'text')
        };

        if (el.tagName === 'SELECT') {
          field.options = Array.from(el.options).map(o => ({ text: o.innerText, value: o.value })).filter(o => o.value);
        } else if (el.classList.contains('vscomp-wrapper')) {
          const hiddenSelect = el.querySelector('select');
          if (hiddenSelect) {
            field.options = Array.from(hiddenSelect.options).map(o => ({ text: o.innerText, value: o.value })).filter(o => o.value);
          } else {
            const dropboxId = el.id ? `vscomp-dropbox-container-${el.id.split('-').pop()}` : null;
            const dropbox = dropboxId ? document.getElementById(dropboxId) : el.querySelector('.vscomp-options-container');
            
            if (dropbox) {
               field.options = Array.from(dropbox.querySelectorAll('.vscomp-option')).map(opt => ({
                 text: opt.querySelector('.vscomp-option-text')?.innerText?.trim() || opt.innerText?.trim(),
                 value: opt.getAttribute('data-value')
               })).filter(o => o.value);
            } else {
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
        .filter(el => !isInternalInput(el) && el.type !== 'hidden')
        .map(mapField);

      const forms = Array.from(document.forms).map((form, i) => ({
        name: form.name || form.id || `Form ${i+1}`,
        fields: fields.filter(f => {
          let el = document.getElementById(f.id);
          if (!el && f.name) el = document.getElementsByName(f.name)[0];
          return el && el.closest('form') === form;
        })
      })).filter(f => f.fields.length > 0);

      // Gather Page Context
      const pageContext = {
        title: document.title,
        mainHeadings: Array.from(document.querySelectorAll('h1, h2, h3')).slice(0, 5).map(h => h.innerText.trim()).filter(t => t),
      };

      // Attach form-specific headings
      forms.forEach(formObj => {
        const formEl = document.querySelector(`form[name="${formObj.name}"], form[id="${formObj.name}"]`);
        if (formEl) {
          const internalHeadings = Array.from(formEl.querySelectorAll('h1, h2, h3, h4, h5, .title, .heading')).map(h => h.innerText.trim()).filter(t => t);
          let previousEl = formEl.previousElementSibling;
          const externalHeadings = [];
          for(let i=0; i<3 && previousEl; i++) {
             if (['H1','H2','H3','H4','H5'].includes(previousEl.tagName) || previousEl.classList.contains('title')) {
               externalHeadings.push(previousEl.innerText.trim());
             }
             previousEl = previousEl.previousElementSibling;
          }
          formObj.context = [...externalHeadings, ...internalHeadings].slice(0, 3).join(" | ");
        }
      });

      sendResponse({ pageContext, forms });
      } catch (e) {
      showNotification("Lỗi quét form: " + e.message, "error");
      sendResponse({ error: e.message });
      }
      return true; // Keep channel open
      } else if (request.action === "apply_data") {    (async () => {
      try {
        const json = JSON.parse(request.json);
        let fillCount = 0;
        let lastEl = null;

        for (const [key, val] of Object.entries(json)) {
          const el = findElement(key);
          if (!el) continue;

          if (el.classList.contains('vscomp-wrapper')) {
            const toggleBtn = el.querySelector('.vscomp-toggle-button') || el;
            
            // Wait for any previous animations to settle
            await new Promise(r => requestAnimationFrame(() => r()));
            
            toggleBtn.click(); // Open dropdown
            
            // Wait for options to render (polling up to 2 seconds)
            let match = null;
            let retries = 20;
            
            while (retries > 0 && !match) {
              await new Promise(r => setTimeout(r, 100));
              
              // Scope to specific dropbox if possible, else global
              const dropboxId = el.id ? `vscomp-dropbox-container-${el.id.split('-').pop()}` : null;
              const dropbox = dropboxId ? document.getElementById(dropboxId) : document.querySelector('.vscomp-options-container');
              
              if (dropbox && dropbox.offsetParent !== null) { // Check if visible
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
              fillCount++;
            } else {
              // Close if opened but not found
              const dropboxId = el.id ? `vscomp-dropbox-container-${el.id.split('-').pop()}` : null;
              const dropbox = dropboxId ? document.getElementById(dropboxId) : document.querySelector('.vscomp-options-container');
              if (dropbox && dropbox.offsetParent !== null) {
                toggleBtn.click();
              }
            }
            
            // Wait for close animation
            await new Promise(r => setTimeout(r, 200));
          } else {
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
                      visibleInput.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
                      visibleInput.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
                      visibleInput.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
                    }
                  }
                }
              }
            }

            el.dispatchEvent(new Event('focus', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new Event('input', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new Event('change', { bubbles: true, cancelable: true }));
            el.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true, cancelable: true, key: 'Enter' }));
            el.dispatchEvent(new Event('blur', { bubbles: true, cancelable: true }));
            fillCount++;
          }
          lastEl = el;
        }

        showNotification(`Đã điền ${fillCount} trường thành công!`, "success");

        if (request.submit && lastEl) {
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
      } catch (e) {
        showNotification("Lỗi: " + e.message, "error");
      }
    })();
  } else if (request.action === "notify") {
    showNotification(request.message, request.type);
  }
});
