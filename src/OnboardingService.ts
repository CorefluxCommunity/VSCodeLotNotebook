// src/OnboardingService.ts
import * as vscode from 'vscode';
import { TelemetryService } from './TelemetryService';

export interface OnboardingStep {
  id: string;
  title: string;
  description: string;
  index: number;
  completed: boolean;
}

export class OnboardingService {
  private static instance: OnboardingService;
  private context: vscode.ExtensionContext;
  private telemetryService: TelemetryService;
  private readonly WALKTHROUGH_ID = 'coreflux.onboarding';
  private readonly SEQUENCE_VERSION = '1.0';
  private readonly TOTAL_STEPS = 10;

  private readonly STEPS: OnboardingStep[] = [
    {
      id: 'create-lot-notebook',
      title: 'Create your first LOT notebook file',
      description: 'Learn how to create a .lotnb file to start working with Language of Things',
      index: 1,
      completed: false
    },
    {
      id: 'create-markdown-file',
      title: 'Create your first Markdown file',
      description: 'Create documentation for your LOT project using Markdown',
      index: 2,
      completed: false
    },
    {
      id: 'connect-broker',
      title: 'Connect to your broker',
      description: 'Establish a connection to an MQTT broker to start publishing data',
      index: 3,
      completed: false
    },
    {
      id: 'create-timer-action',
      title: 'Create an Action that runs every 1 second',
      description: 'Build your first automated action with a timer trigger',
      index: 4,
      completed: false
    },
    {
      id: 'upload-action',
      title: 'Upload the Action to the broker',
      description: 'Deploy your action to the MQTT broker for execution',
      index: 5,
      completed: false
    },
    {
      id: 'create-model',
      title: 'Create a MODEL',
      description: 'Define a data model to structure your IoT information',
      index: 6,
      completed: false
    },
    {
      id: 'create-model-action',
      title: 'Create an Action that publishes the MODEL',
      description: 'Build an action that publishes data using your model structure',
      index: 7,
      completed: false
    },
    {
      id: 'create-python-scripts',
      title: 'Add basic Python scripts',
      description: 'Create reusable Python functions that can be called from your LOT actions',
      index: 8,
      completed: false
    },
    {
      id: 'create-docker-compose',
      title: 'Create a shell script with Docker Compose',
      description: 'Set up a complete local development environment',
      index: 9,
      completed: false
    },
    {
      id: 'upload-to-github',
      title: 'Upload the project to GitHub',
      description: 'Share your LOT project with version control',
      index: 10,
      completed: false
    }
  ];

  private constructor(context: vscode.ExtensionContext, telemetryService: TelemetryService) {
    this.context = context;
    this.telemetryService = telemetryService;
    this.loadProgress();
  }

  public static getInstance(context: vscode.ExtensionContext, telemetryService: TelemetryService): OnboardingService {
    if (!OnboardingService.instance) {
      OnboardingService.instance = new OnboardingService(context, telemetryService);
    }
    return OnboardingService.instance;
  }

  private loadProgress(): void {
    const completedSteps = this.context.globalState.get<string[]>('onboarding.completedSteps', []);
    
    this.STEPS.forEach(step => {
      step.completed = completedSteps.includes(step.id);
    });
  }

  private async saveProgress(): Promise<void> {
    const completedSteps = this.STEPS.filter(step => step.completed).map(step => step.id);
    await this.context.globalState.update('onboarding.completedSteps', completedSteps);
  }

  public async completeStep(stepId: string): Promise<void> {
    const step = this.STEPS.find(s => s.id === stepId);
    if (!step || step.completed) {
      return;
    }

    step.completed = true;
    await this.saveProgress();

    // Emit telemetry event
    await this.telemetryService.emitOnboardingStepEvent(
      this.SEQUENCE_VERSION,
      stepId,
      step.index,
      this.TOTAL_STEPS
    );

    console.log(`Onboarding: Step "${stepId}" completed`);

    // Check if all steps are completed
    if (this.isOnboardingCompleted()) {
      await this.markOnboardingCompleted();
    }

    // Update walkthrough step as completed
    await vscode.commands.executeCommand('setContext', `coreflux.onboarding.${stepId}.completed`, true);
  }

  public isStepCompleted(stepId: string): boolean {
    const step = this.STEPS.find(s => s.id === stepId);
    return step ? step.completed : false;
  }

  public isOnboardingCompleted(): boolean {
    return this.STEPS.every(step => step.completed);
  }

  public getCompletedStepsCount(): number {
    return this.STEPS.filter(step => step.completed).length;
  }

  public getProgress(): { completed: number; total: number; percentage: number } {
    const completed = this.getCompletedStepsCount();
    return {
      completed,
      total: this.TOTAL_STEPS,
      percentage: Math.round((completed / this.TOTAL_STEPS) * 100)
    };
  }

  private async markOnboardingCompleted(): Promise<void> {
    const alreadyCompleted = this.context.globalState.get<boolean>('onboarding.completed', false);
    if (alreadyCompleted) {
      return;
    }

    await this.context.globalState.update('onboarding.completed', true);

    // Emit completion event
    const completedStepIds = this.STEPS.filter(step => step.completed).map(step => step.id);
    await this.telemetryService.emitOnboardingCompletedEvent(
      this.SEQUENCE_VERSION,
      this.TOTAL_STEPS,
      completedStepIds
    );

    console.log('Onboarding: All steps completed!');

    // Show completion message
    const message = 'Congratulations! You\'ve completed the Coreflux onboarding. You\'re ready to build amazing IoT solutions!';
    const action = 'View Documentation';
    
    vscode.window.showInformationMessage(message, action).then(selection => {
      if (selection === action) {
        vscode.env.openExternal(vscode.Uri.parse('https://docs.coreflux.org'));
      }
    });
  }

  public async openWalkthrough(): Promise<void> {
    try {
      await vscode.commands.executeCommand('workbench.action.openWalkthrough', this.WALKTHROUGH_ID);
    } catch (error) {
      console.error('Failed to open walkthrough:', error);
      vscode.window.showErrorMessage('Failed to open the onboarding walkthrough');
    }
  }

  public async checkFirstRun(): Promise<void> {
    const isFirstRun = !this.context.globalState.get<boolean>('onboarding.hasShownWalkthrough', false);
    
    if (isFirstRun) {
      await this.context.globalState.update('onboarding.hasShownWalkthrough', true);
      
      // Show walkthrough automatically on first run
      setTimeout(() => {
        this.openWalkthrough();
      }, 2000); // Delay to let extension fully activate
    }
  }

  public async resetProgress(): Promise<void> {
    // Reset all steps
    this.STEPS.forEach(step => {
      step.completed = false;
    });

    // Clear stored progress
    await this.context.globalState.update('onboarding.completedSteps', []);
    await this.context.globalState.update('onboarding.completed', false);

    // Update contexts
    for (const step of this.STEPS) {
      await vscode.commands.executeCommand('setContext', `coreflux.onboarding.${step.id}.completed`, false);
    }

    console.log('Onboarding: Progress reset');
  }

  public getSteps(): OnboardingStep[] {
    return [...this.STEPS];
  }

  public getStep(stepId: string): OnboardingStep | undefined {
    return this.STEPS.find(step => step.id === stepId);
  }
}