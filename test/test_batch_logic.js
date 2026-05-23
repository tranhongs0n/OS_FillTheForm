
const crypto = require('crypto');

// The new logic from background.js
function extractJson(text, isArray = false) {
  // Strip markdown code blocks
  let cleaned = text.replace(/```(?:json)?\s*([\s\S]*?)```/g, '$1').trim();
  
  const startChar = isArray ? '[' : '{';
  const endChar = isArray ? ']' : '}';
  const firstIndex = cleaned.indexOf(startChar);
  const lastIndex = cleaned.lastIndexOf(endChar);
  
  if (firstIndex !== -1 && lastIndex !== -1) {
    return cleaned.substring(firstIndex, lastIndex + 1);
  }
  return cleaned;
}

function processBatchResponse(text, batchCount) {
    const jsonStr = extractJson(text, batchCount > 1);
    
    if (batchCount > 1) {
        try {
            const batchArray = JSON.parse(jsonStr);
            if (Array.isArray(batchArray)) {
                const batchData = batchArray.map(item => ({ 
                    id: crypto.randomUUID(),
                    data: JSON.stringify(item), 
                    used: false, 
                    timestamp: Date.now() 
                }));
                return batchData;
            } else {
                return { error: "LLM returned an object instead of an array" };
            }
        } catch (e) {
            return { error: e.message };
        }
    }
    return JSON.parse(jsonStr);
}

// Test cases
const testCases = [
    {
        name: "Standard array response",
        text: 'Sure, here is your data: [{"name": "Record 1"}, {"name": "Record 2"}]',
        batchCount: 2,
        expectedLength: 2
    },
    {
        name: "Messy markdown response with triple backticks",
        text: 'Here is the JSON:\n```json\n[\n  {"id": 1},\n  {"id": 2}\n]\n```\nHope it helps!',
        batchCount: 2,
        expectedLength: 2
    },
    {
        name: "Single object with markdown",
        text: '```\n{"name": "Single Record"}\n```',
        batchCount: 1,
        expectedLength: undefined, // Object
        validate: (res) => res.name === "Single Record"
    },
    {
        name: "Single object when batchCount > 1 (Failure case)",
        text: '{"id": 1}',
        batchCount: 2,
        expectedError: true
    }
];

testCases.forEach(tc => {
    console.log(`Testing: ${tc.name}`);
    const result = processBatchResponse(tc.text, tc.batchCount);
    if (tc.expectedError) {
        if (result && result.error) {
            console.log("  PASS: Correctly identified error");
        } else {
            console.log("  FAIL: Should have failed but returned", result);
        }
    } else {
        if (tc.batchCount > 1) {
            if (Array.isArray(result) && result.length === tc.expectedLength) {
                console.log(`  PASS: Got ${result.length} records`);
            } else {
                console.log("  FAIL: Unexpected result", result);
            }
        } else {
            if (tc.validate(result)) {
                console.log("  PASS: Object correctly parsed");
            } else {
                console.log("  FAIL: Object parsing error", result);
            }
        }
    }
});
