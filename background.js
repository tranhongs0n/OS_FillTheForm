chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "get_data") {
    const key = await chrome.storage.local.get('apiKey');
    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: { 'Authorization': `Bearer ${key.apiKey}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model: "gpt-4o",
        messages: [{role: "user", content: `Fill this form: ${JSON.stringify(request.inputs)}`}]
      })
    });
    const data = await response.json();
    chrome.tabs.sendMessage(sender.tab.id, {action: "apply_data", json: data.choices[0].message.content});
  }
});
