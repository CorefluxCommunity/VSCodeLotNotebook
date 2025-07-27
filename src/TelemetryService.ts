// src/TelemetryService.ts
import * as vscode from 'vscode';
import * as mqtt from 'mqtt';
import * as os from 'os';
import { v4 as uuidv4 } from 'uuid';

export interface TelemetryEvent {
  guid: string;
  timestamp: string;
  schemaVersion: number;
  [key: string]: any;
}

export interface StartupEvent extends TelemetryEvent {
  extensionVersion: string;
  vscodeVersion: string;
  osPlatform: string;
  osRelease: string;
  cpuArchitecture: string;
  locale: string;
  timezone: string;
  telemetryConsented: boolean;
}

export interface NewFileEvent extends TelemetryEvent {
  fileName: string;
  createdIn: 'workspace' | 'untitled' | 'outside-workspace';
}

export interface BrokerConnectedEvent extends TelemetryEvent {
  brokerAddress: string;
  tlsUsed: boolean;
  authenticationUsed: boolean;
}

export interface OnboardingStepEvent extends TelemetryEvent {
  sequenceVersion: string;
  stepId: string;
  stepIndex: number;
  totalSteps: number;
  completed: boolean;
}

export interface OnboardingCompletedEvent extends TelemetryEvent {
  sequenceVersion: string;
  totalSteps: number;
  completedStepIds: string[];
  completedAll: boolean;
}

export class TelemetryService {
  private static instance: TelemetryService;
  private context: vscode.ExtensionContext;
  private mqttClient: mqtt.MqttClient | undefined;
  private guid: string;
  private eventQueue: Array<{ topic: string; payload: TelemetryEvent }> = [];
  private isConnected = false;
  private retryTimeout: NodeJS.Timeout | undefined;
  private readonly BROKER_URL = 'mqtt://stats.coreflux.org:1883';
  private readonly SCHEMA_VERSION = 1;
  private readonly RETRY_INTERVALS = [1000, 2000, 5000, 10000, 30000]; // Exponential backoff
  private retryAttempt = 0;

  private constructor(context: vscode.ExtensionContext) {
    this.context = context;
    this.guid = this.getOrCreateGUID();
    this.initializeMqttConnection();
  }

  public static getInstance(context: vscode.ExtensionContext): TelemetryService {
    if (!TelemetryService.instance) {
      TelemetryService.instance = new TelemetryService(context);
    }
    return TelemetryService.instance;
  }

  private getOrCreateGUID(): string {
    let guid = this.context.globalState.get<string>('telemetry.guid');
    if (!guid) {
      guid = uuidv4();
      this.context.globalState.update('telemetry.guid', guid);
    }
    return guid!; // We know it's defined after the if check
  }

  public isTelemetryEnabled(): boolean {
    const config = vscode.workspace.getConfiguration('coreflux');
    return config.get<boolean>('telemetryEnabled', false);
  }

  private async initializeMqttConnection(): Promise<void> {
    if (!this.isTelemetryEnabled()) {
      return;
    }

    try {
      this.mqttClient = mqtt.connect(this.BROKER_URL, {
        clientId: `vscode-lot-extension-${this.guid}`,
        clean: true,
        connectTimeout: 10000,
        reconnectPeriod: 0 // We'll handle reconnection manually
      });

      this.mqttClient.on('connect', () => {
        console.log('Telemetry: Connected to MQTT broker');
        this.isConnected = true;
        this.retryAttempt = 0;
        this.processQueuedEvents();
      });

      this.mqttClient.on('error', (error) => {
        console.error('Telemetry: MQTT connection error:', error);
        this.handleConnectionError();
      });

      this.mqttClient.on('close', () => {
        console.log('Telemetry: MQTT connection closed');
        this.isConnected = false;
        this.scheduleReconnection();
      });

    } catch (error) {
      console.error('Telemetry: Failed to initialize MQTT connection:', error);
      this.handleConnectionError();
    }
  }

  private handleConnectionError(): void {
    this.isConnected = false;
    this.scheduleReconnection();
  }

  private scheduleReconnection(): void {
    if (!this.isTelemetryEnabled()) {
      return;
    }

    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }

    const delay = this.RETRY_INTERVALS[Math.min(this.retryAttempt, this.RETRY_INTERVALS.length - 1)];
    this.retryAttempt++;

    this.retryTimeout = setTimeout(() => {
      console.log(`Telemetry: Retrying connection (attempt ${this.retryAttempt})`);
      this.initializeMqttConnection();
    }, delay);
  }

  private async publishEvent(topic: string, payload: TelemetryEvent): Promise<void> {
    if (!this.isTelemetryEnabled()) {
      return;
    }

    // Add to queue first
    this.eventQueue.push({ topic, payload });

    // Clean old events (older than 7 days)
    const sevenDaysAgo = Date.now() - (7 * 24 * 60 * 60 * 1000);
    this.eventQueue = this.eventQueue.filter(event => 
      new Date(event.payload.timestamp).getTime() > sevenDaysAgo
    );

    // Try to process queue
    this.processQueuedEvents();
  }

  private async processQueuedEvents(): Promise<void> {
    if (!this.isConnected || !this.mqttClient || this.eventQueue.length === 0) {
      return;
    }

    const eventsToProcess = [...this.eventQueue];
    this.eventQueue = [];

    for (const event of eventsToProcess) {
      try {
        await new Promise<void>((resolve, reject) => {
          this.mqttClient!.publish(
            event.topic,
            JSON.stringify(event.payload),
            { qos: 1, retain: false },
            (error) => {
              if (error) {
                reject(error);
              } else {
                resolve();
              }
            }
          );
        });
      } catch (error) {
        console.error('Telemetry: Failed to publish event:', error);
        // Put failed events back in queue
        this.eventQueue.push(event);
      }
    }
  }

  public async emitStartupEvent(): Promise<void> {
    const hasEmittedStartup = this.context.globalState.get<boolean>('telemetry.startupEmitted', false);
    if (hasEmittedStartup) {
      return;
    }

    const event: StartupEvent = {
      guid: this.guid,
      timestamp: new Date().toISOString(),
      schemaVersion: this.SCHEMA_VERSION,
      extensionVersion: this.context.extension.packageJSON.version,
      vscodeVersion: vscode.version,
      osPlatform: os.platform(),
      osRelease: os.release(),
      cpuArchitecture: os.arch(),
      locale: vscode.env.language,
      timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      telemetryConsented: this.isTelemetryEnabled()
    };

    const topic = `coreflux/vscode-lot-extension/${this.guid}/startup`;
    await this.publishEvent(topic, event);
    
    await this.context.globalState.update('telemetry.startupEmitted', true);
  }

  public async emitNewFileEvent(fileName: string, createdIn: 'workspace' | 'untitled' | 'outside-workspace'): Promise<void> {
    const event: NewFileEvent = {
      guid: this.guid,
      timestamp: new Date().toISOString(),
      schemaVersion: this.SCHEMA_VERSION,
      fileName: fileName,
      createdIn: createdIn
    };

    const topic = `coreflux/vscode-lot-extension/${this.guid}/new-file`;
    await this.publishEvent(topic, event);
  }

  public async emitBrokerConnectedEvent(brokerAddress: string, tlsUsed: boolean, authenticationUsed: boolean): Promise<void> {
    const event: BrokerConnectedEvent = {
      guid: this.guid,
      timestamp: new Date().toISOString(),
      schemaVersion: this.SCHEMA_VERSION,
      brokerAddress: brokerAddress,
      tlsUsed: tlsUsed,
      authenticationUsed: authenticationUsed
    };

    const topic = `coreflux/vscode-lot-extension/${this.guid}/broker-connected`;
    await this.publishEvent(topic, event);
  }

  public async emitOnboardingStepEvent(sequenceVersion: string, stepId: string, stepIndex: number, totalSteps: number): Promise<void> {
    const event: OnboardingStepEvent = {
      guid: this.guid,
      timestamp: new Date().toISOString(),
      schemaVersion: this.SCHEMA_VERSION,
      sequenceVersion: sequenceVersion,
      stepId: stepId,
      stepIndex: stepIndex,
      totalSteps: totalSteps,
      completed: true
    };

    const topic = `coreflux/vscode-lot-extension/${this.guid}/onboarding/step`;
    await this.publishEvent(topic, event);
  }

  public async emitOnboardingCompletedEvent(sequenceVersion: string, totalSteps: number, completedStepIds: string[]): Promise<void> {
    const event: OnboardingCompletedEvent = {
      guid: this.guid,
      timestamp: new Date().toISOString(),
      schemaVersion: this.SCHEMA_VERSION,
      sequenceVersion: sequenceVersion,
      totalSteps: totalSteps,
      completedStepIds: completedStepIds,
      completedAll: true
    };

    const topic = `coreflux/vscode-lot-extension/${this.guid}/onboarding/completed`;
    await this.publishEvent(topic, event);
  }

  public async dispose(): Promise<void> {
    if (this.retryTimeout) {
      clearTimeout(this.retryTimeout);
    }

    if (this.mqttClient) {
      this.mqttClient.end(true);
    }
  }

  public getGUID(): string {
    return this.guid;
  }
}