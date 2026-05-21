chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

async function performAutofill(inputs, tabId) {
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
          parts: [{ text: `You are a form auto-filler. Return JSON only. Fill these forms with DIVERSE AND RANDOM sample data based on labels and input types.
Context: ${JSON.stringify(inputs)}
Rules:
1. For <select> (dropdowns), choose exactly one 'value' from the provided 'options' list. Choose DIFFERENT options if called multiple times.
2. For checkboxes/radio buttons, use boolean true/false.
3. For text/email/etc, generate creative, diverse, and random sample data.
Output format: A flat JSON object mapping input names or IDs to values: {"input_name_or_id": "value"}` }]
        }],
        generationConfig: {
          temperature: 1.0
        }
      })
    });
    
    const data = await response.json();
    if (!data.candidates || !data.candidates[0].content.parts[0].text) {
      throw new Error("Invalid response from Gemini API");
    }
    
    const text = data.candidates[0].content.parts[0].text;
    const jsonMatch = text.match(/\{[\s\S]*\}/);
    const jsonStr = jsonMatch ? jsonMatch[0] : text;
    
    await chrome.tabs.sendMessage(tabId, {action: "apply_data", json: jsonStr});
    chrome.runtime.sendMessage({action: "fill_complete"}).catch(() => {}); // Ignore if sidepanel closed
  } catch (e) {
    chrome.runtime.sendMessage({action: "fill_error", error: e.message}).catch(() => {});
    console.error("Autofill Error:", e);
  }
}

chrome.commands.onCommand.addListener(async (command) => {
  if (command === "trigger_autofill") {
    const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
    if (!tab) return;

    chrome.tabs.sendMessage(tab.id, {action: "scan_form"}, async (response) => {
      if (chrome.runtime.lastError || !response || !response.forms || response.forms.length === 0) return;
      await performAutofill(response.forms, tab.id);
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "get_data") {
    performAutofill(request.inputs, request.tabId);
    return true;
  }
});
