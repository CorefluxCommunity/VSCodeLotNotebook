// src/anselmoChatParticipant.ts
import * as vscode from 'vscode';

// // Store chat history? (Simple array for now)
// const chatMessages: vscode.ChatMessage[] = []; // Removed for now due to potential API version issue

/**
 * The Chat Participant for Anselmo.
 */
export class AnselmoChatParticipant {
    // The handler is registered dynamically in extension.ts, 
    // this class might just hold state or utility methods if needed.
    // For simplicity, we'll put the handler logic directly in extension.ts for now.
}

// We'll define the handler function in extension.ts where we have access to the context. 