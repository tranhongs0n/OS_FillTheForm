document.getElementById('saveButton').addEventListener('click', () => {
  const key = document.getElementById('apiKey').value;
  const obfuscated = btoa(key);
  chrome.storage.local.set({apiKey: obfuscated}, () => {
    alert('Key saved and obfuscated!');
  });
});

const overrideTable = document.getElementById('overrideTable');
const addOverrideBtn = document.getElementById('addOverride');
const saveOverridesBtn = document.getElementById('saveOverrides');

function loadOverrides() {
  chrome.storage.local.get(['promptOverrides'], (result) => {
    const overrides = result.promptOverrides || [];
    overrides.forEach(item => addRow(item.pattern, item.instruction));
  });
}

function addRow(pattern = '', instruction = '') {
  const row = overrideTable.insertRow();
  row.innerHTML = `
    <td><input type="text" value="${pattern}" class="pattern"></td>
    <td><input type="text" value="${instruction}" class="instruction"></td>
    <td><button onclick="this.parentElement.parentElement.remove()">Delete</button></td>
  `;
}

addOverrideBtn.addEventListener('click', () => addRow());

saveOverridesBtn.addEventListener('click', () => {
  const overrides = [];
  const rows = overrideTable.querySelectorAll('tr');
  for (let i = 1; i < rows.length; i++) {
    overrides.push({
      pattern: rows[i].querySelector('.pattern').value,
      instruction: rows[i].querySelector('.instruction').value
    });
  }
  chrome.storage.local.set({promptOverrides: overrides}, () => {
    alert('Overrides saved!');
  });
});

loadOverrides();
