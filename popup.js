let capturedInputs = [];

const scanBtn = document.getElementById('scanButton');
const fillBtn = document.getElementById('fillButton');
const status = document.getElementById('status');

scanBtn.addEventListener('click', async () => {
  status.textContent = "Scanning...";
  scanBtn.disabled = true;
  
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  const response = await chrome.tabs.sendMessage(tab.id, {action: "scan_form"});
  
  capturedInputs = response.inputs;
  const list = document.getElementById('fieldsList');
  list.innerHTML = capturedInputs.map(i => `<div>${i.label || i.name} (${i.type})</div>`).join('');
  
  status.textContent = `Found ${capturedInputs.length} fields.`;
  scanBtn.disabled = false;
  fillBtn.disabled = false;
});

fillBtn.addEventListener('click', async () => {
  status.textContent = "Generating...";
  fillBtn.disabled = true;
  
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  chrome.runtime.sendMessage({action: "get_data", inputs: capturedInputs, tabId: tab.id});
});

chrome.runtime.onMessage.addListener((request) => {
  if (request.action === "apply_data") {
    status.textContent = "Filled successfully!";
    fillBtn.disabled = false;
  }
});
