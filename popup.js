let capturedInputs = [];

document.getElementById('scanButton').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  const response = await chrome.tabs.sendMessage(tab.id, {action: "scan_form"});
  
  capturedInputs = response.inputs;
  const list = document.getElementById('fieldsList');
  list.innerHTML = capturedInputs.map(i => `<div>${i.label || i.name} (${i.type})</div>`).join('');
  
  document.getElementById('fillButton').disabled = false;
});

document.getElementById('fillButton').addEventListener('click', async () => {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  chrome.runtime.sendMessage({action: "get_data", inputs: capturedInputs, tabId: tab.id});
});
