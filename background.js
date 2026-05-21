chrome.runtime.onMessage.addListener(async (request, sender, sendResponse) => {
  if (request.action === "get_data") {
    const key = await chrome.storage.local.get('apiKey');
    const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${key.apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{
          parts: [{ text: `Return JSON only. Fill this form based on labels and input types: ${JSON.stringify(request.inputs)}` }]
        }]
      })
    });
    const data = await response.json();
    const text = data.candidates[0].content.parts[0].text.replace(/```json|```/g, '').trim();
    chrome.tabs.sendMessage(sender.tab.id, {action: "apply_data", json: text});
  }
});
