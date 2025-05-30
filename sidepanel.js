let isSelectionMode = false;
let extractedImages = [];

document.addEventListener('DOMContentLoaded', function() {
  const selectModeBtn = document.getElementById('selectMode');
  const clearImagesBtn = document.getElementById('clearImages');
  const statusDiv = document.getElementById('status');
  const imagesContainer = document.getElementById('imagesContainer');
  
  loadSavedImages();
  checkCurrentTabStatus();
  
  selectModeBtn.addEventListener('click', toggleSelectionMode);
  clearImagesBtn.addEventListener('click', clearAllImages);
  
  chrome.tabs.onActivated.addListener(() => {
    checkCurrentTabStatus();
  });
  
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status === 'complete') {
      checkCurrentTabStatus();
    }
  });
  
  function checkCurrentTabStatus() {
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
      if (!tabs[0]) return;
      
      try {
        const response = await chrome.tabs.sendMessage(tabs[0].id, {
          type: 'CHECK_STATUS'
        });
        
        if (response && response.isLoaded) {
          updateSelectionModeUI(response.isSelectionMode);
        } else {
          updateSelectionModeUI(false);
        }
      } catch (err) {
        updateSelectionModeUI(false);
      }
    });
  }
  
  function removeImage(index) {
    console.log('Suppression de l\'image à l\'index:', index);
    if (index >= 0 && index < extractedImages.length) {
      extractedImages.splice(index, 1);
      saveImages();
      renderImages();
      console.log('Image supprimée, il reste:', extractedImages.length, 'images');
    }
  }
  
  function downloadImage(imageData, index) {
    console.log('Téléchargement de l\'image:', imageData.src);
    
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const extension = imageData.format || 'png';
    const fileName = `peacnut-image-${timestamp}.${extension}`;
    
    fetch(imageData.src)
      .then(response => response.blob())
      .then(blob => {
        const url = window.URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.style.display = 'none';
        a.href = url;
        a.download = fileName;
        document.body.appendChild(a);
        a.click();
        window.URL.revokeObjectURL(url);
        document.body.removeChild(a);
      })
      .catch(err => {
        console.error('Erreur lors du téléchargement:', err);
        window.open(imageData.src, '_blank');
      });
  }
  
  chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
    if (message.type === 'IMAGE_EXTRACTED') {
      addImageToSidepanel(message.imageData);
    } else if (message.type === 'SELECTION_MODE_STATUS') {
      updateSelectionModeUI(message.active);
    }
  });
  
  function toggleSelectionMode() {
    chrome.tabs.query({active: true, currentWindow: true}, async (tabs) => {
      if (!tabs[0]) {
        console.error('Aucun onglet actif trouvé');
        return;
      }
      
      const tab = tabs[0];
      
      if (tab.url.startsWith('chrome://') || 
          tab.url.startsWith('chrome-extension://') || 
          tab.url.startsWith('moz-extension://') || 
          tab.url.startsWith('edge://')) {
        console.log('Cannot run on browser internal pages');
        alert('Cette extension ne peut pas fonctionner sur les pages internes du navigateur.');
        return;
      }
      
      try {
        await chrome.tabs.sendMessage(tab.id, {
          type: 'TOGGLE_SELECTION_MODE'
        });
        console.log('Message envoyé au content script existant');
      } catch (err) {
        console.log('Content script pas encore injecté, injection en cours...');
        
        try {
          await chrome.scripting.executeScript({
            target: { tabId: tab.id },
            files: ['content.js']
          });
          
          await chrome.scripting.insertCSS({
            target: { tabId: tab.id },
            files: ['content.css']
          });
          
          console.log('Scripts injectés avec succès');
          
          setTimeout(async () => {
            try {
              await chrome.tabs.sendMessage(tab.id, {
                type: 'TOGGLE_SELECTION_MODE'
              });
              console.log('Message envoyé après injection');
            } catch (secondErr) {
              console.error('Impossible de communiquer avec le content script après injection:', secondErr);
              alert('Erreur: Impossible d\'activer le mode sélection sur cette page.');
            }
          }, 200);
          
        } catch (injectErr) {
          console.error('Erreur injection script:', injectErr);
          
          if (injectErr.message.includes('Cannot access contents')) {
            alert('Permissions insuffisantes pour cette page. Vérifiez que l\'extension a les bonnes permissions.');
          } else {
            alert('Erreur lors de l\'injection du script. Rechargez la page et réessayez.');
          }
        }
      }
    });
  }
  
  function updateSelectionModeUI(active) {
    isSelectionMode = active;
    const selectModeBtn = document.getElementById('selectMode');
    const statusDiv = document.getElementById('status');
    
    let textSpan = selectModeBtn.querySelector('span');
    if (!textSpan) {
      const svg = selectModeBtn.querySelector('svg');
      const currentText = selectModeBtn.textContent.trim();
      
      selectModeBtn.innerHTML = '';
      
      if (!svg) {
        selectModeBtn.innerHTML = `
          <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor">
            <path stroke-linecap="round" stroke-linejoin="round" d="M15.042 21.672 13.684 16.6m0 0-2.51 2.225.569-9.47 5.227 7.917-3.286-.672Zm-7.518-.267A8.25 8.25 0 1 1 20.25 10.5M8.288 14.212A5.25 5.25 0 1 1 17.25 10.5" />
          </svg>
        `;
      } else {
        selectModeBtn.appendChild(svg);
      }
      
      textSpan = document.createElement('span');
      selectModeBtn.appendChild(textSpan);
    }
    
    if (active) {
      textSpan.textContent = 'Désactiver Sélection';
      selectModeBtn.classList.add('active');
      if (statusDiv) {
        statusDiv.textContent = 'Mode sélection ACTIF - Cliquez sur un élément';
        statusDiv.classList.add('active');
        statusDiv.classList.remove('inactive');
      }
    } else {
      textSpan.textContent = 'Mode Sélection';
      selectModeBtn.classList.remove('active');
      if (statusDiv) {
        statusDiv.textContent = 'Cliquez sur "Mode Sélection" pour commencer';
        statusDiv.classList.remove('active');
        statusDiv.classList.add('inactive');
      }
    }
  }
  
  function addImageToSidepanel(imageData) {
    const existingImage = extractedImages.find(img => 
      img.src === imageData.src && 
      Math.abs(img.timestamp - imageData.timestamp) < 1000 
    );
    
    if (existingImage) {
      console.log('Image déjà extraite, ignorée:', imageData.src);
      return;
    }
    
    extractedImages.push(imageData);
    saveImages();
    renderImages();
  }
  
  function renderImages() {
    const container = document.getElementById('imagesContainer');
    
    if (extractedImages.length === 0) {
      container.innerHTML = `
        <div class="placeholder">
          Les images extraites apparaîtront ici<br><br>
        </div>
      `;
      container.classList.remove('has-images');
      return;
    }
    
    container.classList.add('has-images');
    container.innerHTML = '';
    
    extractedImages.forEach((imageData, index) => {
      const imageItem = document.createElement('div');
      imageItem.className = 'image-item';
      
      const downloadBtn = document.createElement('button');
      downloadBtn.className = 'download-btn';
      downloadBtn.title = 'Télécharger cette image';
      downloadBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M3 16.5v2.25A2.25 2.25 0 0 0 5.25 21h13.5A2.25 2.25 0 0 0 21 18.75V16.5M16.5 12 12 16.5m0 0L7.5 12m4.5 4.5V3" />
        </svg>
      `;
      downloadBtn.addEventListener('click', () => {
        downloadImage(imageData, index);
      });
      
      const deleteBtn = document.createElement('button');
      deleteBtn.className = 'delete-btn';
      deleteBtn.title = 'Supprimer cette image';
      deleteBtn.innerHTML = `
        <svg xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24" stroke-width="1.5" stroke="currentColor" class="size-6">
          <path stroke-linecap="round" stroke-linejoin="round" d="M6 18 18 6M6 6l12 12" />
        </svg>
      `;
      deleteBtn.addEventListener('click', () => {
        console.log('Clic sur le bouton de suppression, index:', index);
        removeImage(index);
      });
      
      const img = document.createElement('img');
      img.src = imageData.src;
      img.alt = 'Image extraite';
      img.draggable = true;
      img.ondragstart = (event) => handleDragStart(event, index);
      
      const imageInfo = document.createElement('div');
      imageInfo.className = 'image-info';
      imageInfo.innerHTML = `
        Taille: ${imageData.dimensions || 'Inconnue'}<br>
        Extrait le: ${new Date(imageData.timestamp).toLocaleString()}<br>
        Source: ${imageData.url || 'Inconnue'}
      `;
      
      imageItem.appendChild(downloadBtn);
      imageItem.appendChild(deleteBtn);
      imageItem.appendChild(img);
      imageItem.appendChild(imageInfo);
      
      container.appendChild(imageItem);
    });
  }
  
  function clearAllImages() {
    extractedImages = [];
    saveImages();
    renderImages();
  }
  
  function saveImages() {
    const imagesToSave = extractedImages.slice(-20);
    chrome.storage.local.set({ extractedImages: imagesToSave });
  }
  
  function loadSavedImages() {
    chrome.storage.local.get(['extractedImages'], (result) => {
      if (result.extractedImages) {
        extractedImages = result.extractedImages;
        renderImages();
      }
    });
  }
});

window.handleDragStart = function(event, index) {
  const imageData = extractedImages[index];
  
  event.dataTransfer.setData('text/uri-list', imageData.src);
  event.dataTransfer.setData('text/plain', imageData.src);
  
  const img = event.target;
  event.dataTransfer.setDragImage(img, img.width/2, img.height/2);
  event.dataTransfer.effectAllowed = 'copy';
  
  console.log('Drag started for image:', imageData.src);
};