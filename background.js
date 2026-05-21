chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "get_data") {
    (async () => {
      try {
        const key = await chrome.storage.local.get('apiKey');
        if (!key.apiKey) {
          throw new Error("API Key missing. Please set it in Extension Options.");
        }
        const apiKey = atob(key.apiKey);
        const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/gemini-3.1-flash-lite:generateContent?key=${apiKey}`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            contents: [{
              parts: [{ text: `Return JSON only. Fill this form based on labels and input types: ${JSON.stringify(request.inputs)}. Output format: {"input_name": "sample_value"}` }]
            }]
          })
        });
        const data = await response.json();
        const text = data.candidates[0].content.parts[0].text;
        // Robust JSON extraction
        const jsonMatch = text.match(/\{[\s\S]*\}/);
        const jsonStr = jsonMatch ? jsonMatch[0] : text;
        
        await chrome.tabs.sendMessage(request.tabId, {action: "apply_data", json: jsonStr});
        chrome.runtime.sendMessage({action: "fill_complete"});
      } catch (e) {
        chrome.runtime.sendMessage({action: "fill_error", error: e.message});
      }
    })();
    return true; // Keep channel open
  }
});
