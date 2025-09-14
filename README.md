# LOT VSCode Notebooks Extension (v0.4.2)

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
   - **Enforced Script Naming**: All Python scripts require a specific header format for validation.
   - **Python Script Management**: View, manage, and remove Python scripts through the Coreflux Entities view.

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

6. **Python Scripts Integration**  
   - Create Python scripts using `Coreflux: Create Python Scripts` command
   - All Python scripts must start with `# Script Name: [YourScriptName]` comment
   - View and manage Python scripts in the Coreflux Entities view
   - Remove individual scripts or all Python scripts using context menus

## Commands Overview

### LOT Notebook Commands
| Command                         | Description                                                                          |
|--------------------------------|--------------------------------------------------------------------------------------|
| **LOT Notebook: Create**       | Creates an untitled `.lotnb` notebook.                                                |
| **LOT Notebook: Change Credentials** | Prompts for broker URL, username, password for MQTT connectivity.            |
| **LOT Notebook: Detect and Switch to LOT Language** | Automatically detects LOT syntax and switches cell language. |
| **lot.openTopicPayload**       | Opens a prompt to view/edit payload for an MQTT topic in the TreeView.              |
| **lot.openChatbot**            | Opens the Anselmo ChatBot (beta preview) for LOT assistance.                        |

### Coreflux Entity Management Commands
| Command                         | Description                                                                          |
|--------------------------------|--------------------------------------------------------------------------------------|
| **Coreflux: Refresh**          | Refreshes the Coreflux Entities view.                                                |
| **Coreflux: Copy Code**        | Copies entity code to clipboard.                                                     |
| **Coreflux: View Description** | Views entity description in a webview.                                               |
| **Coreflux: Remove Entity from Coreflux** | Removes selected entity from the broker.                                    |
| **Coreflux: Create Definition in Notebook** | Creates a new entity definition in the active notebook.                    |
| **Coreflux: Update Cell from Coreflux** | Pulls entity code from broker into notebook cell.                        |
| **Coreflux: Update Coreflux from Cell** | Pushes cell code to the broker.                                        |

### Bulk Management Commands
| Command                         | Description                                                                          |
|--------------------------------|--------------------------------------------------------------------------------------|
| **Coreflux: Remove All Models** | Removes all models from the broker.                                                  |
| **Coreflux: Remove All Actions** | Removes all actions from the broker.                                                |
| **Coreflux: Remove All Routes** | Removes all routes from the broker.                                                  |
| **Coreflux: Remove All Rules** | Removes all rules from the broker.                                                   |
| **Coreflux: Remove All Python Scripts** | Removes all Python scripts from the broker.                                    |

### Development & Setup Commands
| Command                         | Description                                                                          |
|--------------------------------|--------------------------------------------------------------------------------------|
| **Coreflux: Open Getting Started Walkthrough** | Opens the interactive walkthrough guide.                                    |
| **Coreflux: Create Markdown Documentation** | Creates markdown documentation for your project.                            |
| **Coreflux: Connect to MQTT Broker** | Connects to the configured MQTT broker.                                        |
| **Coreflux: Disconnect from MQTT Broker** | Disconnects from the MQTT broker.                                            |
| **Coreflux: Create Timer Action** | Creates a timer-based LOT action.                                            |
| **Coreflux: Upload Action to Broker** | Uploads the current action to the broker.                                    |
| **Coreflux: Create Data Model** | Creates a new LOT data model.                                                 |
| **Coreflux: Create Model Action** | Creates an action that uses a data model.                                    |
| **Coreflux: Create Docker Setup** | Creates Docker configuration for Coreflux broker.                            |
| **Coreflux: Setup Git Repository** | Initializes Git repository with appropriate .gitignore.                      |
| **Coreflux: Create Python Scripts** | Creates Python script templates with proper formatting.                     |
| **Coreflux: Test Telemetry Connection** | Tests the telemetry service connection.                                      |

## Python Scripts Integration

### Script Format Requirements

All Python scripts in LOT notebooks must follow a specific format for proper processing:

```python
# Script Name: [YourScriptName]
def your_function():
    return "Hello from Python!"

# Your Python code here...
```

### Key Features

- **Enforced Naming**: Every Python script must start with `# Script Name: [name]` comment
- **Validation**: Scripts without proper headers will show clear error messages
- **Integration**: Python functions can be called from LOT actions using `CALL` statements
- **Management**: View and manage all Python scripts through the Coreflux Entities view
- **Bulk Operations**: Remove individual scripts or all Python scripts at once

### Example Integration

**Python Script:**
```python
# Script Name: Greeter
def say_hello(name="World"):
    return f"Hello, {name}!"

def calculate_temperature(celsius):
    return celsius * 9/5 + 32
```

**LOT Action using Python:**
```lot
DEFINE ACTION GreetingAction
ON EVERY 5 SECONDS DO {
    CALL Greeter.say_hello("LOT User")
    CALL Greeter.calculate_temperature(25)
}
```

### Error Handling

If a Python script is missing the required header, you'll see:
```
Python script must start with "# Script Name: [name]" comment. Please add this comment at the beginning of your Python code.
```

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
### v0.4.2
- **Enhanced Python Scripts Management**:
    - Added comprehensive Python script validation with enforced naming format
    - Implemented `# Script Name: [name]` requirement for all Python scripts
    - Added Python scripts to Coreflux Entities view for easy management
    - New bulk operations: Remove All Python Scripts command
    - Improved error handling with clear validation messages
- **Expanded Command Palette**:
    - Added 25+ new Coreflux commands for comprehensive entity management
    - Organized commands into logical categories (Entity Management, Bulk Operations, Development)
    - Enhanced broker connection management with dedicated connect/disconnect commands
    - Added telemetry testing and walkthrough commands
- **Improved User Experience**:
    - Better command organization and discoverability
    - Enhanced error messages for Python script validation
    - Streamlined entity management workflow
    - Added comprehensive command documentation

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
