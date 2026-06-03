/**
 * Enterprise LLM Auto-Filler Suite - Service Worker
 * 
 * Config-driven, modularized service worker orchestrating form context extraction,
 * model failover attempts, local telemetry, and sequential batch insertions.
 */

// Centralized Application Configuration
const CONFIG = {
  MODELS: [
    'glm4.7',
    'mistral-medium-3.5-128b',
    'mistral-small-4-119b-2603',
    'qwen3-coder-480b-a35b-instruct',
    'deepseek-r1-distill-qwen-32b',
    'deepseek-v4-flash'
  ],
  TIMEOUT_MS: 6000,
  TERMINAL_STATUSES: [400, 401, 403, 404, 429],
  
  // Default Domain instructions and definitions
  DEFAULT_DOMAIN_CONTEXT: `
Vai trò: Chuyên gia BA/Tester chuyên nghiệp.
Nhiệm vụ: Tạo dữ liệu kiểm thử thực tế và đa dạng cho các biểu mẫu.

Ràng buộc Đa dạng (BẮT BUỘC):
- Sử dụng đa dạng họ tên tiếng Việt (không trùng lặp trong cùng một đợt tạo).
- Chức vụ/Thông tin phải phong phú và đa dạng.
- Các nội dung văn bản phải cụ thể, thực tế và không được lặp lại máy móc.

Quy tắc dữ liệu:
- KHÔNG dùng "Test 1", "Nguyễn Văn A". Dùng dữ liệu thật, chuyên nghiệp và tự nhiên.
- Năm hiện tại: 2024-2027.
- Điền đầy đủ tất cả các trường.
`
};

// -------------------------------------------------------------------------
// Service Worker Listeners
// -------------------------------------------------------------------------

chrome.runtime.onInstalled.addListener(() => {
  chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
    .catch((error) => console.error("SidePanel init error:", error));
});

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({ active: true, currentWindow: true });
  if (!tab) return;

  if (command === "trigger_autofill" || command === "trigger_autofill_submit") {
    const shouldSubmit = command === "trigger_autofill_submit";
    chrome.tabs.sendMessage(tab.id, { action: "scan_form" }, async (response) => {
      if (chrome.runtime.lastError || !response || !response.forms || response.forms.length === 0) return;
      await performAutofill(response.forms, tab.id, shouldSubmit, response.pageContext, tab.url);
    });
  } else if (command === "trigger_batch_fill") {
    await handleBatchShortcutFill(tab.id);
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "get_data") {
    const tabUrl = request.url || (sender && sender.tab && sender.tab.url) || "";
    performAutofill(request.inputs, request.tabId, false, request.pageContext, tabUrl, request.batchCount || 1);
    return true;
  }
});

// -------------------------------------------------------------------------
// Core Refactored Autofill Orchestrator
// -------------------------------------------------------------------------

async function performAutofill(inputs, tabId, submitAfterFill = false, pageContext = null, url = "", batchCount = 1) {
  let lastError = null;
  const domainContext = await getPromptForUrl(url);

  // Retrieve user custom selected model & connection timeouts
  const result = await chrome.storage.local.get(['selectedModel', 'timeoutMs']);
  const activeModels = [...CONFIG.MODELS];
  if (result.selectedModel) {
    const idx = activeModels.indexOf(result.selectedModel);
    if (idx !== -1) {
      activeModels.splice(idx, 1);
    }
    activeModels.unshift(result.selectedModel);
  }
  const timeoutMs = result.timeoutMs ? parseInt(result.timeoutMs) : CONFIG.TIMEOUT_MS;

  for (let i = 0; i < activeModels.length; i++) {
    const model = activeModels[i];
    try {
      notifyTab(tabId, model, batchCount, i === 0);

      const apiKey = await getDecryptedApiKey();
      const contextSnapshot = await getContextSnapshot();
      
      const promptText = buildPromptText(domainContext, contextSnapshot, pageContext, inputs, batchCount);
      const responseData = await fetchLlmResponse(model, apiKey, promptText, timeoutMs);
      const jsonStr = extractJsonFromResponse(responseData);

      if (batchCount > 1) {
        await saveBatchRecords(jsonStr, tabId, batchCount);
      } else {
        await applySingleRecord(jsonStr, tabId, submitAfterFill);
      }
      return; // Success! Return immediately to exit the loop.
    } catch (e) {
      lastError = e;
      console.error(`Error failover with model ${model}:`, e);
      if (isTerminalError(e)) break;
    }
  }

  handleAllModelsFailed(tabId, lastError);
}

// -------------------------------------------------------------------------
// Small, Single-Responsibility Helpers
// -------------------------------------------------------------------------

async function getPromptForUrl(url) {
  const result = await chrome.storage.local.get(['promptOverrides']);
  const overrides = result.promptOverrides || [];
  
  if (!url) return CONFIG.DEFAULT_DOMAIN_CONTEXT;
  
  const match = overrides.find(o => {
    try {
      return new RegExp(o.pattern.replace(/\*/g, '.*')).test(url);
    } catch (err) {
      return false;
    }
  });
  return match ? match.instruction : CONFIG.DEFAULT_DOMAIN_CONTEXT;
}

function sanitizeApiKey(key) {
  if (typeof key !== 'string') return '';
  return key.replace(/[^A-Za-z0-9\-_]/g, '').trim();
}

async function getDecryptedApiKey() {
  const keyResult = await chrome.storage.local.get(['apiKey']);
  let key = keyResult.apiKey;
  if (!key) {
    throw new Error("API Key missing. Please set it in Options.");
  }
  
  try {
    const decoded = atob(key).trim();
    // Validate if it looks like a base64-encoded API key
    if (decoded.startsWith("sk-") || decoded.startsWith("AIzaSy")) {
      key = decoded;
    }
  } catch (e) {
    // If decoding fails, treat the stored value itself as the plaintext key
  }
  
  const sanitized = sanitizeApiKey(key);
  if (!sanitized) {
    throw new Error("Invalid API Key format. Please re-enter it in Options.");
  }
  return sanitized;
}

async function getContextSnapshot() {
  const key = await chrome.storage.local.get(['contextSnapshot']);
  return key.contextSnapshot || {};
}

function notifyTab(tabId, model, batchCount, isFirstAttempt) {
  const message = isFirstAttempt 
    ? (batchCount > 1 ? `Đang tạo ${batchCount} bản ghi...` : "Đang tạo dữ liệu mẫu...") 
    : `Lỗi model trước. Thử lại với ${model}...`;
    
  chrome.tabs.sendMessage(tabId, { action: "notify", message });
}

function buildPromptText(domainContext, contextSnapshot, pageContext, inputs, batchCount) {
  const taskDescription = batchCount > 1 
    ? `Nhiệm vụ: Trả về một MẢNG JSON gồm ĐÚNG ${batchCount} đối tượng.`
    : `Nhiệm vụ: Trả về một ĐỐI TƯỢNG JSON duy nhất.`;

  return `
    ${domainContext}

    Context Snapshot: ${JSON.stringify(contextSnapshot)}

    ${taskDescription} Điền form dựa trên label và input type.
    Dữ liệu phải đa dạng, ngẫu nhiên và đúng nghiệp vụ thực tế.

    ${pageContext ? `Page Context (Tiêu đề/Heading trang): ${JSON.stringify(pageContext)}` : ''}
    Context form (Bao gồm headings xung quanh form): ${JSON.stringify(inputs)}

    Rules:
    1. <select>: Chọn đúng 'value' từ 'options'.
    2. Checkbox/Radio: boolean true/false.
    3. date inputs: dùng định dạng 'YYYY-MM-DD'.
    4. Text/Email/TextArea: Theo đúng văn phong chuyên nghiệp và tự nhiên, DỰA VÀO Page Context và Form Context để tạo dữ liệu thật sát với nội dung trang web.
    5. Output Format: Dùng 'label' làm key nếu ID/Name trông giống như mã code tự sinh (ví dụ: b21-Input_...). Nếu ID/Name rõ ràng, hãy dùng chúng.
    Ví dụ: {"Tên chuyên đề": "Giá trị...", "b21-Input_Year": 2026}
    Output: ${batchCount > 1 ? 'Một mảng JSON các đối tượng phẳng.' : 'Một đối tượng JSON phẳng.'}`;
}

async function fetchLlmResponse(model, apiKey, promptText, timeoutMs) {
  const endpoint = 'https://ckey.vn/v1/chat/completions';

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), timeoutMs || CONFIG.TIMEOUT_MS);

  try {
    const requestBody = {
      model: model,
      messages: [
        {
          role: 'user',
          content: promptText
        }
      ]
    };

    // Skip thinking process for deepseek-v4-flash
    if (model === 'deepseek-v4-flash') {
      requestBody.thinking = {
        type: 'disabled'
      };
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`
      },
      signal: controller.signal,
      body: JSON.stringify(requestBody)
    });
    
    return await parseHttpResponse(response);
  } catch (err) {
    if (err.name === 'AbortError') {
      throw new Error(`Yêu cầu hết hạn (${Math.round((timeoutMs || CONFIG.TIMEOUT_MS)/1000)} giây) trên model ${model}. Đang thử model tiếp theo...`);
    }
    throw err;
  } finally {
    clearTimeout(timeoutId);
  }
}

async function parseHttpResponse(response) {
  const contentType = response.headers.get('content-type') || '';
  
  if (!response.ok) {
    let errorMsg = '';
    if (contentType.includes('application/json')) {
      try {
        const data = await response.json();
        errorMsg = data.error?.message || response.statusText || `HTTP error ${response.status}`;
      } catch (e) {
        errorMsg = `Failed to parse JSON error: ${response.statusText || 'Unknown error'}`;
      }
    } else {
      try {
        const text = await response.text();
        // Remove HTML tags, multiple spaces, and trim to extract clean text
        const cleanText = text.replace(/<[^>]*>/g, ' ').replace(/\s+/g, ' ').trim();
        // Limit error message length for display neatness
        errorMsg = cleanText.substring(0, 150) || response.statusText || 'Non-JSON response';
      } catch (e) {
        errorMsg = response.statusText || 'Non-JSON response';
      }
    }
    const err = new Error(`LLM API Error (${response.status}): ${errorMsg}`);
    err.status = response.status;
    throw err;
  }

  try {
    return await response.json();
  } catch (e) {
    throw new Error("Failed to parse successful response from LLM API as JSON");
  }
}

function extractJsonFromResponse(data) {
  if (!data.choices || !data.choices[0] || !data.choices[0].message || !data.choices[0].message.content) {
    throw new Error("Invalid response structure from LLM API");
  }
  
  let text = data.choices[0].message.content;
  
  // Strip <think>...</think> blocks if present (handles closed and unclosed tags)
  text = text.replace(/<think>[\s\S]*?(?:<\/think>|$)/gi, '');
  
  // Strip markdown code blocks
  let cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
  const startChar = cleaned.startsWith('[') ? '[' : '{';
  const endChar = startChar === '[' ? ']' : '}';
  
  const firstIndex = cleaned.indexOf(startChar);
  const lastIndex = cleaned.lastIndexOf(endChar);
  
  if (firstIndex !== -1 && lastIndex !== -1) {
    return cleaned.substring(firstIndex, lastIndex + 1);
  }
  return cleaned;
}

async function saveBatchRecords(jsonStr, tabId, batchCount) {
  try {
    const batchArray = JSON.parse(jsonStr);
    if (!Array.isArray(batchArray)) {
      throw new Error("LLM returned an object instead of an array for batch request.");
    }
    
    const batchData = batchArray.map(item => ({ 
      id: crypto.randomUUID(),
      data: JSON.stringify(item), 
      used: false, 
      timestamp: Date.now() 
    }));
    
    await chrome.storage.local.set({ batchData });
    chrome.tabs.sendMessage(tabId, { action: "notify", message: `Đã tạo xong ${batchArray.length} bản ghi. Sử dụng Ctrl+Shift+B để điền.`, type: "success" });
  } catch (e) {
    console.error("Failed to parse batch JSON", e);
    throw new Error("Generated content is not a valid JSON array: " + e.message);
  }
}

async function applySingleRecord(jsonStr, tabId, submitAfterFill) {
  chrome.runtime.sendMessage({ action: "llm_result", json: jsonStr }).catch(() => {});
  await chrome.tabs.sendMessage(tabId, { action: "apply_data", json: jsonStr, submit: submitAfterFill });
  chrome.runtime.sendMessage({ action: "fill_complete" }).catch(() => {});
}

function isTerminalError(err) {
  return (
    (err.status && CONFIG.TERMINAL_STATUSES.includes(err.status)) ||
    (err.message && err.message.includes("API Key missing"))
  );
}

function handleAllModelsFailed(tabId, lastError) {
  chrome.tabs.sendMessage(tabId, { action: "notify", message: "Lỗi: " + lastError.message, type: "error" });
  chrome.runtime.sendMessage({ action: "fill_error", error: lastError.message }).catch(() => {});
}

async function handleBatchShortcutFill(tabId) {
  const result = await chrome.storage.local.get('batchData');
  const latestBatch = result.batchData || [];
  
  if (!latestBatch || !Array.isArray(latestBatch)) {
    chrome.tabs.sendMessage(tabId, { action: "notify", message: "Chưa có dữ liệu batch. Hãy tạo từ Popup.", type: "error" });
    return;
  }

  const nextIndex = latestBatch.findIndex(item => !item.used);
  if (nextIndex === -1) {
    chrome.tabs.sendMessage(tabId, { action: "notify", message: "Đã hết dữ liệu mẫu trong đợt này.", type: "error" });
    return;
  }

  const record = latestBatch[nextIndex];
  latestBatch[nextIndex].used = true;
  await chrome.storage.local.set({ batchData: latestBatch });

  chrome.tabs.sendMessage(tabId, { action: "apply_data", json: record.data, submit: false });
  
  const remaining = latestBatch.filter(item => !item.used).length;
  chrome.tabs.sendMessage(tabId, { action: "notify", message: `Đã điền xong. Còn lại ${remaining} bản ghi.`, type: "success" });
}
