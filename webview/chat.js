// Script for Anselmo Chat Webview

// Check if running in VS Code webview context
if (typeof acquireVsCodeApi === 'function') {
  const vscode = acquireVsCodeApi();
    
  // Wait for the DOM to be fully loaded
  document.addEventListener('DOMContentLoaded', () => {

    // Check if markdown-it and mermaid are loaded (basic check)
    if (typeof window.markdownit !== 'function' || typeof mermaid !== 'object') {
      console.error("Required libraries (markdown-it or mermaid) not loaded.");
      // Optionally display an error to the user in the webview
      const messagesDiv = document.getElementById('chat-messages');
      if (messagesDiv) {
        const errorDiv = document.createElement('div');
        errorDiv.className = 'message-container assistant-message';
        errorDiv.innerHTML = '<p style="color:red;">Error: Failed to load necessary chat rendering libraries. Please check your network connection or report this issue.</p>';
        messagesDiv.appendChild(errorDiv);
      }
      return; // Stop execution if libraries missing
    }

    // Initialize markdown-it
    const md = window.markdownit({ html: true, linkify: true, typographer: true }); 
    // Initialize mermaid (Simplified)
    mermaid.initialize({ 
      startOnLoad: false, 
      theme: document.body.classList.contains('vscode-dark') ? 'dark' : 'default' // Use built-in dark/default themes based on body class
      // theme: 'base' // Or try base theme
      // Removed themeVariables to simplify
    }); 

    // Get DOM elements
    const sendButton = document.getElementById('send-button');
    const messageInput = document.getElementById('message-input');
    const messagesDiv = document.getElementById('chat-messages');
    const associatedDocElement = document.getElementById('associated-document');
    const modeSelect = document.getElementById('interaction-mode-select');
    const documentContextBanner = document.getElementById('document-context-banner');
    const currentDocumentNameSpan = document.getElementById('current-document-name');
    let currentInteractionMode = 'ask';

    if (!sendButton || !messageInput || !messagesDiv || !modeSelect || !documentContextBanner || !currentDocumentNameSpan) {
      console.error("Chat UI elements (sendButton, messageInput, messagesDiv, modeSelect, documentContextBanner, or currentDocumentNameSpan) not found!");
      return;
    }

    // --- NEW: Event Listener for Mode Select Dropdown ---
    if (modeSelect) {
      modeSelect.addEventListener('change', (event) => {
        currentInteractionMode = event.target.value;
        console.log('Interaction mode changed to:', currentInteractionMode);
        updateInputPlaceholder(); // Update placeholder based on new mode
      });
    }

    // --- NEW: Function to auto-resize textarea ---
    function autoResizeTextarea(textarea) {
      if (!textarea) return;
      textarea.style.height = 'auto'; 
      textarea.style.height = textarea.scrollHeight + 'px';
    }

    // --- NEW: Function to update message input placeholder ---
    function updateInputPlaceholder() {
      if (!messageInput || !modeSelect) return;
      const docName = currentDocumentNameSpan ? currentDocumentNameSpan.textContent : null;

      if (currentInteractionMode === 'ask' && docName && docName !== '(No document context)') {
        messageInput.placeholder = `Ask about ${docName}... (Shift+Enter for new line)`;
      } else if (currentInteractionMode === 'help') {
        messageInput.placeholder = 'Ask a general question... (Shift+Enter for new line)';
      } else { // Covers 'edit' or any other default
        messageInput.placeholder = 'Type your message... (Shift+Enter for new line)';
      }
    }

    // --- Function to add a message to the chat display --- 
    function addMessageToUI(text, sender, updates = []) {
      // Store the raw markdown text for assistant messages for copying
      const rawMarkdown = (sender === 'assistant') ? text : null; 

      const messageDiv = document.createElement('div');
      messageDiv.className = 'message-container ';
      messageDiv.className += sender === 'user' ? 'user-message' : 'assistant-message';

      if (sender === 'assistant') {
        // Render assistant messages as Markdown
        messageDiv.innerHTML = md.render(text); 

        // Find and render Mermaid diagrams AFTER innerHTML is set
        const mermaidPres = Array.from(messageDiv.querySelectorAll('pre code.language-mermaid'));
        mermaidPres.forEach((block, index) => {
          const preElement = block.parentElement;
          if (!preElement) {
            console.error('Cannot find pre element for mermaid block'); 
            return; 
          }
          try {
            const id = `mermaid-graph-${Date.now()}-${index}`;
            const graphDefinition = block.textContent || '';
            const container = document.createElement('div');
            container.id = id;
            container.classList.add('mermaid');
            container.textContent = graphDefinition;

            // Insert the container AFTER the <pre> element
            preElement.parentNode?.insertBefore(container, preElement.nextSibling);
            preElement.style.display = 'none'; // Hide the original <pre>

            // Use mermaid.run() which might be more robust
            mermaid.run({ nodes: [container] })
              .catch(e => {
                console.error('Mermaid rendering error (mermaid.run):', e);
                // On error, show the original code block and an error message
                const errorMsg = document.createElement('p');
                errorMsg.style.color = 'red';
                errorMsg.textContent = 'Failed to render diagram.';
                container.parentNode?.insertBefore(errorMsg, container);
                container.parentNode?.insertBefore(preElement, errorMsg); // Put original <pre> back
                preElement.style.display = ''; // Make sure original <pre> is visible
                container.remove(); // Remove the failed container
              });

          } catch (e) {
            console.error('Error processing Mermaid block:', e);
            preElement.insertAdjacentHTML('afterend', '<p style="color:red;">Failed to process diagram block</p>'); 
          }
        });

        // Find LOT code blocks and apply basic highlighting + add copy buttons
        const lotBlocks = Array.from(messageDiv.querySelectorAll('pre code.language-lot')); // Removed TS assertion
        lotBlocks.forEach(block => {
          if (!(block instanceof HTMLElement)) return; // Type guard
          // --- Apply Basic Highlighting --- 
          let code = block.textContent || '';
          // Order matters: Apply comments first, then strings, then keywords
          
          // Comments (simple line/block for now)
          code = code.replace(/(\/\/.*$)/gm, '<span class="lot-comment">$1</span>'); // Line comments
          code = code.replace(/(\/\*[\s\S]*?\*\/)/gm, '<span class="lot-comment">$1</span>'); // Block comments

          // Strings
          code = code.replace(/("[^"\n]*")/g, '<span class="lot-string">$1</span>');

          // Keywords (from your tmLanguage)
          const keywords = ['DEFINE', 'MODEL', 'RULE', 'ROUTE', 'ACTION', 'PUBLISH', 'KEEP', 'GET', 'ON', 'EVERY', 'DO', 'IF', 'THEN', 'ELSE', 'SET', 'FILTER', 'REGEX', 'ADD', 'WITH', 'TOPIC', 'AS', 'TRIGGER', 'INT', 'BOOL', 'TRUE', 'FALSE', 'STRING', 'DOUBLE', 'OBJECT', 'NULL']; // Added common ones
          const keywordRegex = new RegExp(`\\b(${keywords.join('|')})\\b`, 'g');
          code = code.replace(keywordRegex, '<span class="lot-keyword">$1</span>');

          // Apply the highlighted HTML back to the block
          block.innerHTML = code; 
          // --- End Highlighting --- 

          const pre = block.parentElement; // Get parent element
          if (!(pre instanceof HTMLElement)) return; // Null check and type guard

          const button = document.createElement('button');
          button.innerHTML = '&#x1F4CB;';
          button.title = 'Copy code';
          button.className = 'copy-button';
          button.onclick = () => {
            navigator.clipboard.writeText(block.textContent || '')
              .then(() => {
                button.innerHTML = '&#x2705;';
                setTimeout(() => { if(button) button.innerHTML = '&#x1F4CB;'; }, 2000);
              })
              .catch(err => {
                console.error('Copy failed:', err);
                button.textContent = 'Error!'; // Indicate copy error
                setTimeout(() => { if(button) button.textContent = 'Copy'; }, 2000);
              });
          };
          if (!pre.querySelector('.copy-button')) {
            pre.appendChild(button);
          }
        });

        // Add "Copy Full Reply" button for assistant messages
        const copyReplyButton = document.createElement('button');
        copyReplyButton.innerHTML = '&#x1F4DD;'; // Memo emoji
        copyReplyButton.title = 'Copy full Markdown reply';
        copyReplyButton.className = 'copy-reply-button';
        copyReplyButton.onclick = () => {
          if (rawMarkdown) {
            navigator.clipboard.writeText(rawMarkdown)
              .then(() => {
                copyReplyButton.innerHTML = '&#x2705;'; // Checkmark
                setTimeout(() => { if(copyReplyButton) copyReplyButton.innerHTML = '&#x1F4DD;'; }, 2000);
              })
              .catch(err => {
                console.error('Copy full reply failed:', err);
                copyReplyButton.textContent = 'Error!';
                setTimeout(() => { if(copyReplyButton) copyReplyButton.innerHTML = '&#x1F4DD;'; }, 2000);
              });
          }
        };
        // Ensure the button isn't added multiple times
        if (!messageDiv.querySelector('.copy-reply-button')) {
          messageDiv.appendChild(copyReplyButton);
        }

        // --- NEW: Add Update Cell buttons if updates exist ---
        if (updates && updates.length > 0) {
          const updatesContainer = document.createElement('div');
          updatesContainer.className = 'update-buttons-container';

          updates.forEach(update => {
            const button = document.createElement('button');
            button.textContent = `Update Cell ${update.index + 1}`;
            button.className = 'update-cell-button';
            button.dataset.cellIndex = update.index; // Store index
            button.dataset.newContent = update.newContent; 
            
            button.addEventListener('click', () => {
              const cellIndex = parseInt(button.dataset.cellIndex, 10);
              const newContent = button.dataset.newContent;
              if (!isNaN(cellIndex) && typeof newContent === 'string') {
                console.log(`[Webview] Requesting update for cell ${cellIndex}`);
                vscode.postMessage({
                  command: 'applyCellUpdate',
                  cellIndex: cellIndex,
                  newContent: newContent
                });
                button.disabled = true;
                button.textContent = `Requested Update for Cell ${cellIndex + 1}`;
              } else {
                console.error('Invalid data for cell update button:', button.dataset);
                vscode.postMessage({ command: 'alert', text: 'Error: Could not apply update due to missing data.'});
              }
            });
            updatesContainer.appendChild(button);
          });
          messageDiv.appendChild(updatesContainer); // Append container to message div
        }


      } else {
        messageDiv.textContent = text;
      }

      messagesDiv.appendChild(messageDiv);
      setTimeout(() => {
        messagesDiv.scrollTop = messagesDiv.scrollHeight; 
      }, 50);
    }

    // --- Send message function --- 
    function sendMessage() {
      const message = messageInput.value;
      if (message && message.trim()) {
        addMessageToUI(message, 'user');

        // --- Get Computed Theme Colors ---
        const computedStyle = getComputedStyle(document.body);
        const themeColors = {
          background: computedStyle.getPropertyValue('--vscode-editor-background') || '#1e1e1e',
          foreground: computedStyle.getPropertyValue('--vscode-editor-foreground') || '#d4d4d4',
          accent: computedStyle.getPropertyValue('--vscode-button-background') || '#0e639c',
          border: computedStyle.getPropertyValue('--vscode-panel-border') || '#808080'
          // Add more colors as needed by Anselmo
        };
        console.log('[Webview] Computed theme colors:', themeColors);
        // --- End Theme Color Get --- 

        vscode.postMessage({
          command: 'sendMessage', 
          text: message.trim(),
          colors: themeColors,
          mode: currentInteractionMode
        });
        messageInput.value = '';
        autoResizeTextarea(messageInput);
        messageInput.focus();
      }
    }

    sendButton.addEventListener('click', sendMessage);

    messageInput.addEventListener('keydown', (event) => {
      if (event.key === 'Enter' && !event.shiftKey) {
        event.preventDefault(); 
        sendMessage(); 
      }
      autoResizeTextarea(messageInput);
    });
    autoResizeTextarea(messageInput);

    window.addEventListener('message', event => {
      const message = event.data; 
            
      switch (message.command) {
      case 'addMessage':
        addMessageToUI(message.text, message.sender || 'assistant', message.updates); 
        break;
      case 'addMessageAndSend':
        // Add the message to UI first (usually the prompt/query itself)
        addMessageToUI(message.text, message.sender || 'user');
        // Now trigger the process to send this text to the extension's API handler
        // We can directly post the message back, similar to how sendMessage works
        console.log('[Webview] Received addMessageAndSend, posting sendMessage for:', message.text);
        vscode.postMessage({
          command: 'sendMessage', 
          text: message.text // Send the original text back to extension for API call
        });
        break;
        // Add more cases later (e.g., show thinking indicator)
      case 'setDocumentContext':
        updateAssociatedDocument(message.filename);
        if (documentContextBanner && currentDocumentNameSpan) {
          if (message.filename) {
            currentDocumentNameSpan.textContent = message.filename;
            documentContextBanner.style.display = 'block';
          } else {
            documentContextBanner.style.display = 'none';
          }
        }
        updateInputPlaceholder();
        vscode.setState({ ...vscode.getState(), associatedFilename: message.filename });
        break;
      case 'clearDocumentContext':
        updateAssociatedDocument(null);
        if (documentContextBanner && currentDocumentNameSpan) {
          currentDocumentNameSpan.textContent = '';
          documentContextBanner.style.display = 'none';
        }
        updateInputPlaceholder();
        vscode.setState({ ...vscode.getState(), associatedFilename: null });
        break;
      }
    });

    const previousState = vscode.getState();
    if (previousState && previousState.messages) {
      console.log('Restoring previous state:', previousState);
      messagesDiv.innerHTML = ''; // Clear welcome message
      previousState.messages.forEach(msg => addMessageToUI(msg.text, msg.sender));
      if (previousState.associatedFilename) { // NEW: Restore filename display
        updateAssociatedDocument(previousState.associatedFilename);
      }
    } else {
      console.log('No previous state found.');
    }

    // --- NEW: Function to update associated document display ---
    function updateAssociatedDocument(filename) {
      if (associatedDocElement) {
        if (filename) {
          associatedDocElement.textContent = `Context: ${filename}`;
          associatedDocElement.title = `Chatting in the context of ${filename}`;
        } else {
          associatedDocElement.textContent = `(No document context)`;
          associatedDocElement.title = 'Chat opened without a specific document context.';
        }
      }
      if (currentDocumentNameSpan && documentContextBanner) { 
        if (filename) {
          currentDocumentNameSpan.textContent = filename;
          documentContextBanner.style.display = 'block';
        } else {
          currentDocumentNameSpan.textContent = '';
          documentContextBanner.style.display = 'none';
        }
      }
      updateInputPlaceholder();
    }

    // Initialize Mermaid and signal readiness
    function initializeChat() {
      console.log("Initializing Chat UI...");
      // mermaid.initialize({ startOnLoad: false }); // Mermaid is already initialized earlier in your DOMContentLoaded

      // ---> NEW: Initialize mode, placeholder, and textarea size <---
      if (modeSelect) {
        currentInteractionMode = modeSelect.value; // Set initial mode from dropdown
      }
      updateInputPlaceholder(); // Set initial placeholder based on mode and any restored context
      if (messageInput) { // messageInput is now a textarea
        autoResizeTextarea(messageInput); // Initial resize
      }
      // --- END NEW INITIALIZATION ---
      
      // NEW: Signal webview is ready (Keep your existing postMessage)
      vscode.postMessage({ command: 'webviewReady' });
      console.log("Chat UI Initialized. Posted webviewReady.");
    }

    // Run initialization when the script loads (Keep your existing call)
    initializeChat();
  });
} else {
  console.error('acquireVsCodeApi is not available. Script must run in a VS Code webview context.');
} 