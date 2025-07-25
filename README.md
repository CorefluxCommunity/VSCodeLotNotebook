# LOT VSCode Notebooks Extension (v0.3.2)

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
   - Possibly provides charting if the JSON output references numeric data

4. **Anselmo ChatBot (beta preview)**  
   - Access an integrated ChatBot knowledgeable about Language Of Things (LOT) via the Notebook toolbar icon (🤖).
   - Ask questions about LOT syntax, concepts, or request code examples.
   - Includes Markdown rendering, diagram rendering (Mermaid), and code block copying.

5. **“Verification of the Status of the Broker”**   
   - Each Code cell shows if it is synced / unsynced / missing
   - There is a list of Components of the broker and their current standard in comparison to the Broker
   - A context menu is created for backup / copy code / restore or place in the project


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
### v0.3.1
- Added LOT code Completions:
    - Dynamic Code completions for ACTIONS / ROUTES / MODELS / RULES
    - Beginning of Introduction of VISUS (still under development)


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
- Added **Anselmo ChatBot (beta preview)**:
    - Integrated webview chatbot accessible from the notebook toolbar.
    - Provides explanations and assistance for Language Of Things (LOT).
    - Added **Explain LOT Cell** command to send cell content directly to the chatbot.

### v0.2.5

- Added the Visu add/ remove commands for broker version >1.6

### v0.2.1

- Polished MQTT credential handling  
- Basic chart display for numeric data in cells

---

### Thank You for Using LOT Notebooks!

*Made by the Coreflux team with a LOT of love ❤️*
