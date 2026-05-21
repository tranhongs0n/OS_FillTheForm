chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "scan_form") {
    const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
      label: el.labels?.[0]?.innerText || el.placeholder || el.name,
      id: el.id,
      name: el.name,
      type: el.type
    }));
    sendResponse({inputs});
  } else if (request.action === "apply_data") {
    const json = JSON.parse(request.json);
    for (const [key, val] of Object.entries(json)) {
      const el = document.querySelector(`[name="${key}"], [id="${key}"]`);
      if (el) { el.value = val; el.dispatchEvent(new Event('input')); }
    }
  }
});
