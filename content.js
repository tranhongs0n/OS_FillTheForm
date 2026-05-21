chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan_form") {
    const mapField = el => {
      const field = {
        label: el.labels?.[0]?.innerText || el.placeholder || el.name || el.id,
        name: el.name,
        id: el.id,
        type: el.type
      };
      if (el.tagName === 'SELECT') {
        field.options = Array.from(el.options).map(opt => ({
          text: opt.innerText,
          value: opt.value
        })).filter(opt => opt.value !== ""); // Filter out empty/placeholder options
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
    const json = JSON.parse(request.json);
    for (const [key, val] of Object.entries(json)) {
      const el = document.querySelector(`[name="${key}"], [id="${key}"]`);
      if (el) {
        if (el.tagName === 'SELECT') {
          // Try to match by value first, then by text
          const option = Array.from(el.options).find(opt => opt.value === val || opt.innerText === val);
          if (option) {
            el.value = option.value;
          }
        } else if (el.type === 'checkbox' || el.type === 'radio') {
           el.checked = !!val;
        } else {
          el.value = val;
        }
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }
});
