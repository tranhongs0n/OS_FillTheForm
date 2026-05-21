chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "start_fill") {
    const inputs = Array.from(document.querySelectorAll('input, select, textarea')).map(el => ({
      label: el.labels?.[0]?.innerText || el.placeholder || el.name,
      id: el.id,
      name: el.name,
      type: el.type
    }));
    chrome.runtime.sendMessage({action: "get_data", inputs});
  }
});
