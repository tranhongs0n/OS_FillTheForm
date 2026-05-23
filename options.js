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
  
  const cellPattern = row.insertCell();
  const inputPattern = document.createElement('input');
  inputPattern.type = 'text';
  inputPattern.value = pattern;
  inputPattern.className = 'pattern';
  cellPattern.appendChild(inputPattern);

  const cellInstruction = row.insertCell();
  const inputInstruction = document.createElement('input');
  inputInstruction.type = 'text';
  inputInstruction.value = instruction;
  inputInstruction.className = 'instruction';
  cellInstruction.appendChild(inputInstruction);

  const cellActions = row.insertCell();
  const deleteBtn = document.createElement('button');
  deleteBtn.textContent = 'Delete';
  deleteBtn.onclick = () => row.remove();
  cellActions.appendChild(deleteBtn);
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
