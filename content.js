chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan_form") {
    const forms = Array.from(document.forms).map((form, index) => ({
      name: form.name || form.id || `Form ${index + 1}`,
      fields: Array.from(form.querySelectorAll('input, select, textarea')).map(el => ({
        label: el.labels?.[0]?.innerText || el.placeholder || el.name || el.id,
        name: el.name,
        id: el.id,
        type: el.type
      }))
    }));

    // Find orphans (inputs not in any form)
    const allInputs = Array.from(document.querySelectorAll('input, select, textarea'));
    const orphans = allInputs.filter(el => !el.form).map(el => ({
      label: el.labels?.[0]?.innerText || el.placeholder || el.name || el.id,
      name: el.name,
      id: el.id,
      type: el.type
    }));

    if (orphans.length > 0) {
      forms.push({ name: "Detached Fields", fields: orphans });
    }

    sendResponse({ forms });
  } else if (request.action === "apply_data") {
    const json = JSON.parse(request.json);
    for (const [key, val] of Object.entries(json)) {
      const el = document.querySelector(`[name="${key}"], [id="${key}"]`);
      if (el) {
        el.value = val;
        el.dispatchEvent(new Event('input', { bubbles: true }));
        el.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
  }
});
