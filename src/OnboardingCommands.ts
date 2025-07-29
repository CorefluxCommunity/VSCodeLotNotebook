// src/OnboardingCommands.ts
import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';
import { OnboardingService } from './OnboardingService';
import { TelemetryService } from './TelemetryService';

export class OnboardingCommands {
  private onboardingService: OnboardingService;
  private telemetryService: TelemetryService;

  constructor(onboardingService: OnboardingService, telemetryService: TelemetryService) {
    this.onboardingService = onboardingService;
    this.telemetryService = telemetryService;
  }

  public async openWalkthrough(): Promise<void> {
    await this.onboardingService.openWalkthrough();
  }

  public async createMarkdownFile(): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      let notebookUri: vscode.Uri;
      
      if (workspaceFolder) {
        notebookUri = vscode.Uri.joinPath(workspaceFolder.uri, 'walkthrough.lotnb');
      } else {
        vscode.window.showWarningMessage('Please open a workspace folder first to use the walkthrough.');
        return;
      }

      // Check if walkthrough.lotnb already exists
      let notebookDoc: vscode.NotebookDocument;
      try {
        notebookDoc = await vscode.workspace.openNotebookDocument(notebookUri);
      } catch {
        vscode.window.showWarningMessage('Please create a LOT notebook first using the walkthrough.');
        return;
      }

      // Add markdown cell with walkthrough explanation
      const markdownContent = this.getWalkthroughExplanationTemplate();
      const cellData = new vscode.NotebookCellData(vscode.NotebookCellKind.Markup, markdownContent, 'markdown');
      const edit = new vscode.WorkspaceEdit();
      const notebookEdit = new vscode.NotebookEdit(
        new vscode.NotebookRange(notebookDoc.cellCount, notebookDoc.cellCount),
        [cellData]
      );
      edit.set(notebookDoc.uri, [notebookEdit]);
      await vscode.workspace.applyEdit(edit);
      
      // Show the notebook
      await vscode.window.showNotebookDocument(notebookDoc);

      await this.onboardingService.completeStep('create-markdown-file');
      await this.telemetryService.emitNewFileEvent('walkthrough.lotnb', 'workspace');

      vscode.window.showInformationMessage('✅ Added walkthrough explanation to your notebook!');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create markdown cell: ${error}`);
    }
  }

  public async connectBroker(): Promise<void> {
    try {
      // Use the new broker connection dialog
      await vscode.commands.executeCommand('coreflux.handleBrokerStatusClick');
      
      // The actual connection success will be detected by the existing MQTT connection logic
      // which should call telemetryService.emitBrokerConnectedEvent and complete the step
      
      vscode.window.showInformationMessage('Use the broker connection dialog to connect to your MQTT broker.');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to open broker connection: ${error}`);
    }
  }

  public async createTimerAction(): Promise<void> {
    try {
      const actionContent = this.getTimerActionTemplate();
      
      // Use walkthrough.lotnb file consistently
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      let notebookUri: vscode.Uri;
      
      if (workspaceFolder) {
        notebookUri = vscode.Uri.joinPath(workspaceFolder.uri, 'walkthrough.lotnb');
      } else {
        // Fallback to untitled if no workspace
        const cellData = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, actionContent, 'lot');
        const notebookData = new vscode.NotebookData([cellData]);
        const doc = await vscode.workspace.openNotebookDocument('lot-notebook', notebookData);
        await vscode.window.showNotebookDocument(doc);
        await this.onboardingService.completeStep('create-timer-action');
        vscode.window.showInformationMessage('✅ Created timer action! This action runs every 1 second.');
        return;
      }

      // Check if walkthrough.lotnb already exists
      let notebookDoc: vscode.NotebookDocument;
      try {
        notebookDoc = await vscode.workspace.openNotebookDocument(notebookUri);
      } catch {
        // Create new walkthrough.lotnb file
        const cellData = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, actionContent, 'lot');
        const notebookData = new vscode.NotebookData([cellData]);
        notebookDoc = await vscode.workspace.openNotebookDocument('lot-notebook', notebookData);
        
        // Create the file in the workspace
        await vscode.workspace.fs.writeFile(notebookUri, Buffer.from(''));
        notebookDoc = await vscode.workspace.openNotebookDocument(notebookUri);
      }

      // Add cell to existing notebook
      const cellData = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, actionContent, 'lot');
      const edit = new vscode.WorkspaceEdit();
      const notebookEdit = new vscode.NotebookEdit(
        new vscode.NotebookRange(notebookDoc.cellCount, notebookDoc.cellCount),
        [cellData]
      );
      edit.set(notebookDoc.uri, [notebookEdit]);
      await vscode.workspace.applyEdit(edit);
      
      // Show the notebook
      await vscode.window.showNotebookDocument(notebookDoc);

      await this.onboardingService.completeStep('create-timer-action');
      vscode.window.showInformationMessage('✅ Created timer action! This action runs every 1 second.');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create timer action: ${error}`);
    }
  }

  public async uploadAction(): Promise<void> {
    try {
      // Use walkthrough.lotnb file consistently
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      let notebookUri: vscode.Uri;
      
      if (workspaceFolder) {
        notebookUri = vscode.Uri.joinPath(workspaceFolder.uri, 'walkthrough.lotnb');
      } else {
        vscode.window.showWarningMessage('Please open a workspace folder first to use the walkthrough.');
        return;
      }

      // Check if walkthrough.lotnb exists and open it
      let notebookDoc: vscode.NotebookDocument;
      try {
        notebookDoc = await vscode.workspace.openNotebookDocument(notebookUri);
      } catch {
        vscode.window.showWarningMessage('Please create actions first using the walkthrough, then run this command.');
        return;
      }

      // Show the notebook
      await vscode.window.showNotebookDocument(notebookDoc);

      // Use existing upload command
      await vscode.commands.executeCommand('coreflux.uploadEntitiesFromNotebook');
      
      await this.onboardingService.completeStep('upload-action');
      vscode.window.showInformationMessage('✅ Action uploaded to broker!');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to upload action: ${error}`);
    }
  }

  public async createModel(): Promise<void> {
    try {
      const modelContent = this.getModelTemplate();
      
      // Use walkthrough.lotnb file consistently
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      let notebookUri: vscode.Uri;
      
      if (workspaceFolder) {
        notebookUri = vscode.Uri.joinPath(workspaceFolder.uri, 'walkthrough.lotnb');
      } else {
        // Fallback to untitled if no workspace
        const cellData = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, modelContent, 'lot');
        const notebookData = new vscode.NotebookData([cellData]);
        const doc = await vscode.workspace.openNotebookDocument('lot-notebook', notebookData);
        await vscode.window.showNotebookDocument(doc);
        await this.onboardingService.completeStep('create-model');
        vscode.window.showInformationMessage('✅ Created data model!');
        return;
      }

      // Check if walkthrough.lotnb already exists
      let notebookDoc: vscode.NotebookDocument;
      try {
        notebookDoc = await vscode.workspace.openNotebookDocument(notebookUri);
      } catch {
        // Create new walkthrough.lotnb file
        const cellData = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, modelContent, 'lot');
        const notebookData = new vscode.NotebookData([cellData]);
        notebookDoc = await vscode.workspace.openNotebookDocument('lot-notebook', notebookData);
        
        // Create the file in the workspace
        await vscode.workspace.fs.writeFile(notebookUri, Buffer.from(''));
        notebookDoc = await vscode.workspace.openNotebookDocument(notebookUri);
      }

      // Add cell to existing notebook
      const cellData = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, modelContent, 'lot');
      const edit = new vscode.WorkspaceEdit();
      const notebookEdit = new vscode.NotebookEdit(
        new vscode.NotebookRange(notebookDoc.cellCount, notebookDoc.cellCount),
        [cellData]
      );
      edit.set(notebookDoc.uri, [notebookEdit]);
      await vscode.workspace.applyEdit(edit);
      
      // Show the notebook
      await vscode.window.showNotebookDocument(notebookDoc);

      await this.onboardingService.completeStep('create-model');
      vscode.window.showInformationMessage('✅ Created data model!');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create model: ${error}`);
    }
  }

  public async createModelAction(): Promise<void> {
    try {
      const actionContent = this.getModelActionTemplate();
      
      // Use walkthrough.lotnb file consistently
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      let notebookUri: vscode.Uri;
      
      if (workspaceFolder) {
        notebookUri = vscode.Uri.joinPath(workspaceFolder.uri, 'walkthrough.lotnb');
      } else {
        vscode.window.showWarningMessage('Please open a workspace folder first to use the walkthrough.');
        return;
      }

      // Check if walkthrough.lotnb already exists
      let notebookDoc: vscode.NotebookDocument;
      try {
        notebookDoc = await vscode.workspace.openNotebookDocument(notebookUri);
      } catch {
        vscode.window.showWarningMessage('Please create a model first using the walkthrough, then run this command.');
        return;
      }

      // Add cell to existing notebook
      const cellData = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, actionContent, 'lot');
      const edit = new vscode.WorkspaceEdit();
      const notebookEdit = new vscode.NotebookEdit(
        new vscode.NotebookRange(notebookDoc.cellCount, notebookDoc.cellCount),
        [cellData]
      );
      edit.set(notebookDoc.uri, [notebookEdit]);
      await vscode.workspace.applyEdit(edit);
      
      // Show the notebook
      await vscode.window.showNotebookDocument(notebookDoc);

      await this.onboardingService.completeStep('create-model-action');
      vscode.window.showInformationMessage('✅ Created action that publishes your model!');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create model action: ${error}`);
    }
  }

  public async createDockerSetup(): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      
      if (!workspaceFolder) {
        vscode.window.showWarningMessage('Please open a workspace folder first.');
        return;
      }

      // Create docker-compose.yml
      const dockerComposePath = vscode.Uri.joinPath(workspaceFolder.uri, 'docker-compose.yml');
      const dockerComposeContent = this.getDockerComposeTemplate();
      await vscode.workspace.fs.writeFile(dockerComposePath, Buffer.from(dockerComposeContent));

      // Create start script
      const startScriptPath = vscode.Uri.joinPath(workspaceFolder.uri, 'start-coreflux.sh');
      const startScriptContent = this.getStartScriptTemplate();
      await vscode.workspace.fs.writeFile(startScriptPath, Buffer.from(startScriptContent));

      // Make script executable (on Unix systems)
      if (process.platform !== 'win32') {
        await vscode.workspace.fs.stat(startScriptPath).then(() => {
          // File exists, we can't directly set permissions via VS Code API
          // but we can suggest to the user
        });
      }

      // Create README for Docker setup
      const dockerReadmePath = vscode.Uri.joinPath(workspaceFolder.uri, 'DOCKER-SETUP.md');
      const dockerReadmeContent = this.getDockerReadmeTemplate();
      await vscode.workspace.fs.writeFile(dockerReadmePath, Buffer.from(dockerReadmeContent));

      // Open the docker-compose file
      const doc = await vscode.workspace.openTextDocument(dockerComposePath);
      await vscode.window.showTextDocument(doc);

      await this.onboardingService.completeStep('create-docker-compose');
      vscode.window.showInformationMessage('✅ Created Docker setup! Run ./start-coreflux.sh to start locally.');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create Docker setup: ${error}`);
    }
  }

  public async createPythonScripts(): Promise<void> {
    try {
      const pythonContent = this.getPythonScriptsTemplate();
      
      // Use walkthrough.lotnb file consistently
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      let notebookUri: vscode.Uri;
      
      if (workspaceFolder) {
        notebookUri = vscode.Uri.joinPath(workspaceFolder.uri, 'walkthrough.lotnb');
      } else {
        vscode.window.showWarningMessage('Please open a workspace folder first to use the walkthrough.');
        return;
      }

      // Check if walkthrough.lotnb already exists
      let notebookDoc: vscode.NotebookDocument;
      try {
        notebookDoc = await vscode.workspace.openNotebookDocument(notebookUri);
      } catch {
        vscode.window.showWarningMessage('Please create a LOT notebook first using the walkthrough.');
        return;
      }

      // Add cell to existing notebook
      const cellData = new vscode.NotebookCellData(vscode.NotebookCellKind.Code, pythonContent, 'python');
      const edit = new vscode.WorkspaceEdit();
      const notebookEdit = new vscode.NotebookEdit(
        new vscode.NotebookRange(notebookDoc.cellCount, notebookDoc.cellCount),
        [cellData]
      );
      edit.set(notebookDoc.uri, [notebookEdit]);
      await vscode.workspace.applyEdit(edit);
      
      // Show the notebook
      await vscode.window.showNotebookDocument(notebookDoc);

      await this.onboardingService.completeStep('create-python-scripts');
      vscode.window.showInformationMessage('✅ Created Python scripts! These can be used in your LOT actions.');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to create Python scripts: ${error}`);
    }
  }

  public async setupGitRepo(): Promise<void> {
    try {
      const workspaceFolder = vscode.workspace.workspaceFolders?.[0];
      
      if (!workspaceFolder) {
        vscode.window.showWarningMessage('Please open a workspace folder first.');
        return;
      }

      // Create .gitignore
      const gitignorePath = vscode.Uri.joinPath(workspaceFolder.uri, '.gitignore');
      const gitignoreContent = this.getGitignoreTemplate();
      await vscode.workspace.fs.writeFile(gitignorePath, Buffer.from(gitignoreContent));

      // Initialize git if not already initialized
      const gitExists = await vscode.workspace.fs.stat(vscode.Uri.joinPath(workspaceFolder.uri, '.git')).then(() => true, () => false);
      
      if (!gitExists) {
        // Use VS Code's built-in git functionality
        await vscode.commands.executeCommand('git.init');
      }

      // Open source control view
      await vscode.commands.executeCommand('workbench.view.scm');

      await this.onboardingService.completeStep('upload-to-github');
      vscode.window.showInformationMessage('✅ Git repository setup complete! Use the Source Control panel to commit and push to GitHub.');
    } catch (error) {
      vscode.window.showErrorMessage(`Failed to setup Git repository: ${error}`);
    }
  }

  // Template methods
  private getMarkdownTemplate(): string {
    return `# My Coreflux IoT Project

This project demonstrates how to use Language of Things (LOT) to build IoT solutions.

## Features

- Timer-based actions that run every second
- Data models for structured IoT data
- MQTT broker integration
- Docker-based local development

## Getting Started

1. Open the \`.lotnb\` notebook file
2. Connect to your MQTT broker
3. Run the actions to see data flow

## Learn More

- [Coreflux Documentation](https://docs.coreflux.org)
- [Language of Things Guide](https://docs.coreflux.org/lot)
- [MQTT Basics](https://docs.coreflux.org/mqtt)

## Project Structure

- \`*.lotnb\` - LOT notebook files with your IoT logic
- \`docker-compose.yml\` - Local development environment
- \`start-coreflux.sh\` - Script to start local broker

Happy building! 🚀
`;
  }

  private getTimerActionTemplate(): string {
    return `DEFINE ACTION HeartbeatAction
ON EVERY 1 SECOND DO
    PUBLISH TOPIC "heartbeat" WITH "alive"
    SET "currentTime" WITH TIMESTAMP "UTC"
    PUBLISH TOPIC "system/time" WITH {currentTime}`;
  }

  private getModelTemplate(): string {
    return `DEFINE MODEL SensorReading
    ADD NUMBER "temperature"
    ADD NUMBER "humidity" 
    ADD STRING "location"
    ADD "timestamp" WITH TIMESTAMP "UTC"`;
  }

  private getModelActionTemplate(): string {
    return `DEFINE ACTION PublishSensorData
ON EVERY 5 SECONDS DO
    SET "temp" WITH (RANDOM 18 25)
    SET "humid" WITH (RANDOM 40 60)
    PUBLISH MODEL SensorReading TO "sensors/data" WITH
        temperature = {temp}
        humidity = {humid}
        location = "Office"`;
  }

  private getDockerComposeTemplate(): string {
    return `version: '3.8'

services:
  mosquitto:
    image: eclipse-mosquitto:2.0
    container_name: coreflux-mosquitto
    ports:
      - "1883:1883"
      - "9001:9001"
    volumes:
      - ./mosquitto.conf:/mosquitto/config/mosquitto.conf
      - mosquitto_data:/mosquitto/data
      - mosquitto_logs:/mosquitto/log
    restart: unless-stopped

  coreflux:
    image: coreflux/coreflux:latest
    container_name: coreflux-server
    ports:
      - "8080:8080"
    environment:
      - MQTT_BROKER_URL=tcp://mosquitto:1883
      - COREFLUX_LOG_LEVEL=info
    depends_on:
      - mosquitto
    restart: unless-stopped
    volumes:
      - coreflux_data:/app/data

volumes:
  mosquitto_data:
  mosquitto_logs:
  coreflux_data:
`;
  }

  private getStartScriptTemplate(): string {
    return `#!/bin/bash

# Coreflux Local Development Environment

echo "🚀 Starting Coreflux local environment..."

# Check if Docker is running
if ! docker info > /dev/null 2>&1; then
    echo "❌ Docker is not running. Please start Docker first."
    exit 1
fi

# Create mosquitto config if it doesn't exist
if [ ! -f mosquitto.conf ]; then
    echo "📝 Creating Mosquitto configuration..."
    cat > mosquitto.conf << EOF
listener 1883
allow_anonymous true
persistence true
persistence_location /mosquitto/data/
log_dest file /mosquitto/log/mosquitto.log
EOF
fi

# Start services
echo "🐳 Starting containers..."
docker-compose up -d

echo "✅ Coreflux is starting up!"
echo ""
echo "📋 Services:"
echo "   MQTT Broker: localhost:1883"
echo "   Coreflux UI:  http://localhost:8080"
echo ""
echo "🔧 Commands:"
echo "   Stop:     docker-compose down"
echo "   Logs:     docker-compose logs -f"
echo "   Restart:  docker-compose restart"
echo ""
echo "Happy building! 🎉"
`;
  }

  private getDockerReadmeTemplate(): string {
    return `# Docker Development Environment

This setup provides a complete local Coreflux development environment using Docker.

## Prerequisites

- Docker and Docker Compose installed
- Basic familiarity with MQTT

## Quick Start

\`\`\`bash
# Make the script executable (Linux/Mac)
chmod +x start-coreflux.sh

# Start the environment
./start-coreflux.sh
\`\`\`

## Services

### MQTT Broker (Mosquitto)
- **Port:** 1883
- **WebSocket:** 9001
- **Config:** mosquitto.conf

### Coreflux Server
- **Port:** 8080
- **UI:** http://localhost:8080

## Development Workflow

1. Start the local environment: \`./start-coreflux.sh\`
2. Open VS Code and connect to \`localhost:1883\`
3. Deploy your LOT notebooks to the local broker
4. View results in the Coreflux UI

## Useful Commands

\`\`\`bash
# View logs
docker-compose logs -f

# Stop everything
docker-compose down

# Restart services
docker-compose restart

# Clean up (removes data)
docker-compose down -v
\`\`\`

## Troubleshooting

- **Connection refused:** Make sure Docker is running
- **Port conflicts:** Check if ports 1883 or 8080 are in use
- **Permission errors:** Run \`chmod +x start-coreflux.sh\`

For more help, visit [docs.coreflux.org](https://docs.coreflux.org)
`;
  }

  private getWalkthroughExplanationTemplate(): string {
    return `# 🚀 Coreflux Walkthrough Guide

Welcome to the Language of Things (LOT) walkthrough! This notebook will guide you through building your first IoT solution step by step.

## 📋 What You'll Learn

This walkthrough will teach you how to:

1. **Create IoT Actions** - Build automated behaviors that respond to events
2. **Define Data Models** - Structure your IoT data for better organization
3. **Connect to MQTT Brokers** - Establish real-time communication
4. **Deploy to Production** - Upload your solutions to live environments
5. **Set Up Local Development** - Create a complete development environment

## 🎯 Walkthrough Structure

Each cell in this notebook represents a step in your IoT journey:

- **Timer Actions** - Actions that run on a schedule (every second, minute, etc.)
- **Data Models** - Structured data definitions for your IoT devices
- **Model Actions** - Actions that publish structured data using your models
- **Broker Connections** - Real-time MQTT communication setup

## 🔧 How to Use This Notebook

1. **Follow the Steps** - Execute each cell in order
2. **Connect Your Broker** - Use the broker connection dialog
3. **Upload Actions** - Deploy your code to the MQTT broker
4. **Monitor Results** - Watch your IoT solution in action

## 🌟 Example: Smart Office Monitor

In this walkthrough, you'll build a smart office monitoring system that:

- **Publishes heartbeat signals** every second
- **Tracks sensor data** (temperature, humidity, location)
- **Runs continuously** on your MQTT broker
- **Provides real-time insights** into your environment

## 📚 Next Steps

After completing this walkthrough, you'll be ready to:

- Build more complex IoT solutions
- Integrate with real sensors and devices
- Create custom data models for your use cases
- Deploy to production Coreflux environments

---

*Ready to start? Let's build something amazing! 🎉*
`;
  }

  private getPythonScriptsTemplate(): string {
    return `# @name Greeter
def say_hello(name='World'):
    return f'Hello, {name}!'

# Example usage:
# result = say_hello('Alice')
# print(result)`;
  }

  private getGitignoreTemplate(): string {
    return `# Coreflux Project .gitignore

# Node modules
node_modules/
npm-debug.log*

# Environment variables
.env
.env.local

# IDE files
.vscode/settings.json
.idea/
*.swp
*.swo

# OS files
.DS_Store
Thumbs.db

# Docker volumes
mosquitto_data/
mosquitto_logs/
coreflux_data/

# Build outputs
dist/
build/
*.log

# Temporary files
tmp/
temp/
*.tmp

# Credentials (keep your secrets safe!)
credentials.json
config/local.json
`;
  }
}