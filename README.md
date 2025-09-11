# LOT VSCode Notebooks Extension (v0.4.1)

**LOT Notebooks** is a Visual Studio Code extension that provides:
- A **notebook** interface for the **LOT** (Language of Things) DSL
- Integration with **MQTT** for live data and real-time updates
- A built-in **chatbot** command so you can easily open your external or custom chatbot (under dev)

## Features

1. **LOT Language Notebook**  
   - Create or open `.lotnb` notebooks recognized by this extension
   - Edit **LOT** code (`DEFINE MODEL`, `DEFINE ACTION`, etc.) in **notebook cells**  
   - Execute your cells to run **remove→add→subscribe** logic with MQTT

2. **MQTT Integration**  
   - Connect to an MQTT broker (credentials can be configured)
   - Subscribe/publish to topics
   - Listen for real-time messages from the broker, displayed in your LOT cells

3. **Live Data Views**  
   - Renders numeric payloads in real-time with a custom JSON-based approach
   - Provides charting for numeric data.
   - **Enhanced Payload Rendering:** Automatically detects and renders various payload types from topic payloads:
      - **JSON Breakdown:** Expandable structures for JSON payloads.
      - **Image Preview:** View images from base64 encoded topic payloads directly in the live data view.
      - **HTML Content:** Renders HTML snippets in an iframe for preview.
      - **Nested JSON & Base64 Detection:** Intelligently extracts and renders JSON objects or long base64 strings embedded within larger payloads.

5. **“Verification of the Status of the Broker”**   
   - Each Code cell shows if it is synced / unsynced / missing
   - There is a list of Components of the broker and their current standard in comparison to the Broker
   - A context menu is created for backup / copy code / restore or place in the project

6. **Python Scripting (Experimental)**
   - Write and execute Python scripts within notebook cells.
   - Scripts must start with `# Script Name: [YourScriptName]` comment for proper processing.
   - Seamlessly integrate Python logic with your LOT workflows.

## Usage

1. **Create a new `.lotnb` Notebook**  
   - Open Command Palette (`Ctrl+Shift+P`) → `LOT Notebook: Create New Notebook`  
   - A new untitled `.lotnb` file opens with the LOT notebook UI.

2. **Add Cells**  
   - Each cell can contain LOT code, e.g.  
     ```lot
     DEFINE MODEL MyModel WITH TOPIC "XPTO" ...
     ```
   - The extension recognizes the `lot` language within `.lnt` notebooks.

3. **Run Cells**  
   - Press the run icon on a cell or the top Notebook Run button  
   - The extension executes remove→add→subscribe logic for the code

4. **Configure MQTT**  
   - Use the command `LOT Notebook: Change Credentials` to set broker URL, username, password  
   - The extension automatically connects when running a cell if not already connected

5. **Open Chatbot**  
   - In the cell **toolbar** (the inline buttons), click **Open Chatbot** (it appears if the cell's language is `lot`)  
   - The extension runs `lot.openChatbot`, which can open your external chatbot in a webview or external browser  
   - Adjust this logic in your extension code if you want a different chatbot approach

## Commands Overview

| Command                         | Description                                                                          |
|--------------------------------|--------------------------------------------------------------------------------------|
| **LOT Notebook: Create**       | Creates an untitled `.lotnb` notebook.                                                |
| **LOT Notebook: Change Credentials** | Prompts for broker URL, username, password for MQTT connectivity.            |
| **lot.openTopicPayload**       | Opens a prompt to view/edit payload for an MQTT topic in the TreeView.              |
| **coreflux.createPythonScripts** | Creates a new Python script cell with the required format.                          |

## Known Issues / Troubleshooting

- **Cannot find module 'mqtt'**: Ensure `mqtt` is listed under `"dependencies"` in `package.json` and no `.vscodeignore` is excluding `node_modules`.
- **No cell output**: Double-check you used `DEFINE MODEL|ACTION|RULE`, so the extension's logic can parse your code.
- **Chatbot** not opening? By default, the command just shows an info message. Modify `lot.openChatbot` in `extension.ts` to open your actual webview or external URL.

## Further Documentation and Links

- **[Coreflux.org](https://coreflux.org/)**: Coreflux is more than just a self-hosted MQTT broker; it also offers a cloud MQTT broker solution. The company's focus is on describing data-driven systems and connecting OT devices or events with IT systems via LOT Routes.
- **[Docs: Language of Things (LOT)](https://docs.coreflux.org/LOT/)**: Overview of what LOT is.
- **[Docs: LOT Syntax Reference](https://docs.coreflux.org/LOT/syntax/)**: Detailed overview of LOT syntax categories, keywords, and operators.
- **[Docs: LOT Actions](https://docs.coreflux.org/LOT/actions/)**: Explains how to define and use LOT actions.
- **[Docs: LOT Models](https://docs.coreflux.org/LOT/models/)**: Explains how models are set up and used in LOT.
- **[Docs: LOT Rules](https://docs.coreflux.org/LOT/rules/)**: Explains how to write and apply rules in LOT.

## Release Notes
### v0.4.1
- **Enhanced Walkthrough Experience**:
    - Completely redesigned the onboarding walkthrough with beginner-friendly explanations
    - Added "What", "Why", and "How" sections to each step for better learning experience
    - Removed Docker Compose and GitHub setup steps to focus on core LOT functionality
    - Updated Python integration example to use timer-based actions instead of topic triggers
- **Improved Python Integration**:
    - Enhanced Python script templates with cleaner, more focused examples
    - Updated LOT action templates to use `ON EVERY 5 SECONDS` for automatic execution
    - Better integration between Python functions and LOT actions in walkthrough
- **Simplified Docker Setup**:
    - Updated Docker templates to use the official Coreflux MQTT broker image
    - Streamlined Docker Compose configuration with single-container setup
    - Removed separate Mosquitto configuration for easier deployment

### v0.4.0
- Added LOT code Completions:
    - Dynamic Code completions for ACTIONS / ROUTES / MODELS / RULES
    - Beginning of Introduction of VISUS (still under development)
- **Python Scripting (Experimental)**:
    - Added support for Python scripts in notebook cells, requiring a specific header format.
    - Integrated commands for creating and managing Python scripts.
- **Enhanced Live Data Views**:
    - Implemented advanced payload rendering for JSON, Base64 images, and HTML content directly within tree views.
    - Added capabilities for detecting and extracting nested JSON and long Base64 strings.
    - Improved charting for numeric data with dynamic type selection (e.g., Int8, Float32).

### v0.3.0

- Added **Coreflux Entities** view:
    - Tree view displays Models, Actions, Rules, and Routes currently active on the connected MQTT broker.
    - Status icons indicate if an entity definition exists in the open workspace notebooks and if it's synchronized with the broker.
- Added Entity synchronization commands (available from context menu in Coreflux Entities view):
    - **Update Broker from Cell**: Pushes the code from the corresponding notebook cell to the broker.
    - **Update Cell from Coreflux**: Pulls the code from the broker into the corresponding notebook cell.
    - **Create Definition in Notebook**: Inserts a `DEFINE` statement for the entity at the cursor in the active notebook.
    - **Remove Entity from Coreflux**: Sends a command to remove the entity from the broker.
- Added **Go To Definition** for entities: Clicking an entity in the tree view navigates to its `DEFINE` statement in the corresponding notebook cell.

### v0.2.5

- Added the Visu add/ remove commands for broker version >1.6

### v0.2.1

- Polished MQTT credential handling  
- Basic chart display for numeric data in cells

---

### Thank You for Using LOT Notebooks!

*Made by the Coreflux team with a LOT of love ❤️*
