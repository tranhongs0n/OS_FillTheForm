chrome.sidePanel.setPanelBehavior({ openPanelOnActionClick: true })
  .catch((error) => console.error(error));

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

Quy tắc dữ liệu:
- KHÔNG dùng "Test 1", "Nguyễn Văn A". Dùng dữ liệu thật, chuyên nghiệp.
- Giọng văn hành chính, trang trọng. Năm 2024-2027.
- Hạn cuối gửi kế hoạch: 15/11 năm trước đó.
- Điền đầy đủ tất cả các trường.
`;

async function performAutofill(inputs, tabId) {
  try {
    chrome.tabs.sendMessage(tabId, {action: "notify", message: "Đang tạo dữ liệu mẫu..."});
    
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
          parts: [{ text: `
      ${DOMAIN_CONTEXT}

      Nhiệm vụ: Trả về JSON duy nhất. Điền form dựa trên label và input type.
      Dữ liệu phải đa dạng, ngẫu nhiên và đúng nghiệp vụ QHS_GiamSat.

      Context form: ${JSON.stringify(request.inputs)}

      Rules:
      1. <select>: Chọn đúng 'value' từ 'options'.
      2. Checkbox/Radio: boolean true/false.
      3. Text/Email/TextArea: Theo đúng văn phong hành chính QHS_GiamSat ở trên.
      4. Output Format: Dùng 'label' làm key nếu ID/Name trông giống như mã code tự sinh (ví dụ: b21-Input_...). Nếu ID/Name rõ ràng, hãy dùng chúng.
      Ví dụ: {"Tên chuyên đề": "Giá trị...", "b21-Input_Year": 2026}
      Output: Một đối tượng JSON phẳng.` }]
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
    chrome.runtime.sendMessage({action: "fill_complete"}).catch(() => {});
  } catch (e) {
    chrome.tabs.sendMessage(tabId, {action: "notify", message: "Lỗi: " + e.message, type: "error"});
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
