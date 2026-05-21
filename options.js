document.getElementById('saveButton').addEventListener('click', () => {
  const key = document.getElementById('apiKey').value;
  const obfuscated = btoa(key);
  chrome.storage.local.set({apiKey: obfuscated}, () => {
    alert('Key saved and obfuscated!');
  });
});
