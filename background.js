chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

async function getPromptForUrl(url) {
  const result = await chrome.storage.local.get(['promptOverrides']);
  const overrides = result.promptOverrides || [];
  const match = overrides.find(o => new RegExp(o.pattern.replace(/\*/g, '.*')).test(url));
  return match ? match.instruction : DOMAIN_CONTEXT;
}

const MODELS = [
  'gemini-3.1-flash-lite-preview',
  'gemini-3-flash-preview',
  'gemini-2.5-flash-lite',
  'gemini-2.5-flash'
];

async function performAutofill(inputs, tabId, submitAfterFill = false, pageContext = null, url = "") {
  let lastError = null;

  for (const model of MODELS) {
    try {
      chrome.tabs.sendMessage(tabId, {
        action: "notify", 
        message: MODELS.indexOf(model) === 0 ? "Đang tạo dữ liệu mẫu..." : `Lỗi model trước. Thử lại với ${model}...`
      });
      
      const key = await chrome.storage.local.get(['apiKey', 'contextSnapshot']);
      if (!key.apiKey) {
        throw new Error("API Key missing. Please set it in Extension Options.");
      }
      const apiKey = atob(key.apiKey);
      const contextSnapshot = key.contextSnapshot || {};
      const domainContext = await getPromptForUrl(url);
      
      const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent?key=${apiKey}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          contents: [{
            parts: [{ text: `
        ${domainContext}

        Context Snapshot: ${JSON.stringify(contextSnapshot)}

        Nhiệm vụ: Trả về JSON duy nhất. Điền form dựa trên label và input type.
        Dữ liệu phải đa dạng, ngẫu nhiên và đúng nghiệp vụ QHS_GiamSat.

        ${pageContext ? `Page Context (Tiêu đề/Heading trang): ${JSON.stringify(pageContext)}` : ''}
        Context form (Bao gồm headings xung quanh form): ${JSON.stringify(inputs)}

        Rules:
        1. <select>: Chọn đúng 'value' từ 'options'.
        2. Checkbox/Radio: boolean true/false.
        3. date inputs: dùng định dạng 'YYYY-MM-DD'.
        4. Text/Email/TextArea: Theo đúng văn phong hành chính QHS_GiamSat ở trên, DỰA VÀO Page Context và Form Context để tạo dữ liệu thật sát với nội dung trang web.
        5. Output Format: Dùng 'label' làm key nếu ID/Name trông giống như mã code tự sinh (ví dụ: b21-Input_...). Nếu ID/Name rõ ràng, hãy dùng chúng.
        Ví dụ: {"Tên chuyên đề": "Giá trị...", "b21-Input_Year": 2026}
        Output: Một đối tượng JSON phẳng.` }]
          }],

          generationConfig: {
            temperature: 1.0
          }
        })
      });

      let data;
      try {
        data = await response.json();
      } catch (e) {
        if (!response.ok) {
          throw new Error(`Gemini API Error (${response.status}): ${response.statusText || 'Non-JSON error response'}`);
        }
        throw new Error("Failed to parse response from Gemini API");
      }

      if (!response.ok) {
        const errorMsg = data.error?.message || response.statusText || `HTTP error ${response.status}`;
        const err = new Error(`Gemini API Error (${response.status}): ${errorMsg}`);
        err.status = response.status;
        throw err;
      }

      if (!data.candidates || !data.candidates[0].content.parts[0].text) {
        throw new Error("Invalid response from Gemini API");
      }
      
      const text = data.candidates[0].content.parts[0].text;
      const jsonMatch = text.match(/\{[\s\S]*\}/);
      const jsonStr = jsonMatch ? jsonMatch[0] : text;
      
      // Send to popup for display
      chrome.runtime.sendMessage({action: "llm_result", json: jsonStr}).catch(() => {});

      await chrome.tabs.sendMessage(tabId, {action: "apply_data", json: jsonStr, submit: submitAfterFill});
      chrome.runtime.sendMessage({action: "fill_complete"}).catch(() => {});
      
      return; // Success! Exit the loop and function.
    } catch (e) {
      lastError = e;
      console.error(`Error with model ${model}:`, e);
      
      // If error is not transient (e.g. 400 Bad Request, 401 Unauthorized), don't retry with other models
      if (e.status && ![429, 500, 503, 504].includes(e.status)) {
        break; 
      }
      // If no API key, no point in retrying
      if (e.message.includes("API Key missing")) {
        break;
      }
    }
  }

  // If we reach here, all models failed
  chrome.tabs.sendMessage(tabId, {action: "notify", message: "Lỗi: " + lastError.message, type: "error"});
  chrome.runtime.sendMessage({action: "fill_error", error: lastError.message}).catch(() => {});
}

chrome.commands.onCommand.addListener(async (command) => {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (!tab) return;

  if (command === "trigger_autofill" || command === "trigger_autofill_submit") {
    const shouldSubmit = command === "trigger_autofill_submit";
    chrome.tabs.sendMessage(tab.id, {action: "scan_form"}, async (response) => {
      if (chrome.runtime.lastError || !response || !response.forms || response.forms.length === 0) return;
      await performAutofill(response.forms, tab.id, shouldSubmit, response.pageContext, tab.url);
    });
  }
});

chrome.runtime.onMessage.addListener((request, sender, sendResponse) => {
  if (request.action === "get_data") {
    performAutofill(request.inputs, request.tabId, false, request.pageContext, request.url || sender.tab.url);
    return true;
  }
});

const DOMAIN_CONTEXT = `
Vai trò: Chuyên gia BA/Tester dự án Hành chính công (QHS_GiamSat - Hệ thống Quản lý Hoạt động Giám sát của Quốc hội).
Bối cảnh: Quản lý vòng đời giám sát (Đề xuất -> Lập chương trình -> Điều hòa -> Triển khai chuyên đề).

Master Data & Thuật ngữ:
1. Cơ quan (M_Agency): Ủy ban Thường vụ Quốc hội, Hội đồng Dân tộc, các Ủy ban (Pháp luật, Kinh tế, Văn hóa - Giáo dục, Xã hội...), Đoàn ĐBQH tỉnh/thành phố, Tổng Thư ký Quốc hội.
2. Đối tượng: Chính phủ, các Bộ (Công an, GD&ĐT, Y tế...), UBND TP. Hà Nội/HCM.
3. Chủ đề: PCCC, đổi mới sách giáo khoa, bạo lực học đường, bất động sản, ATGT.
4. Loại văn bản (M_DocumentType): Tờ trình, Nghị quyết, Quyết định, Báo cáo, Công văn.
5. Định dạng Số/Ký hiệu: [Số]/KH-UBTVQH15, [Số]/2026/NQ-UBTVQH15.
6. Người dùng (MonitorUser_Extend): Họ tên tiếng Việt (Chủ nhiệm, Phó Chủ nhiệm, Ủy viên thường trực, Đại biểu Quốc hội, Chuyên viên).

Ràng buộc Đa dạng (BẮT BUỘC):
- Sử dụng đa dạng họ tên tiếng Việt (không trùng lặp trong cùng một đợt tạo).
- Chức vụ phải phong phú: từ cấp lãnh đạo (Chủ nhiệm, Phó Chủ nhiệm) đến chuyên viên.
- Các chuyên đề, nhiệm vụ, nội dung văn bản phải cụ thể, thực tế và không được lặp lại máy móc.
- Phân bổ dữ liệu ngẫu nhiên nhưng phải hợp lý về mặt nghiệp vụ hành chính.

Quy tắc dữ liệu:
- KHÔNG dùng "Test 1", "Nguyễn Văn A". Dùng dữ liệu thật, chuyên nghiệp.
- Giọng văn hành chính, trang trọng. Năm 2024-2027.
- Hạn cuối gửi kế hoạch: 15/11 năm trước đó.
- Điền đầy đủ tất cả các trường.
`;
