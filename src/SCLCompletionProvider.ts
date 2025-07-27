// src/SCLCompletionProvider.ts

import * as vscode from 'vscode';

export class SCLCompletionProvider implements vscode.CompletionItemProvider {
  provideCompletionItems(
    document: vscode.TextDocument,
    position: vscode.Position,
    token: vscode.CancellationToken,
    context: vscode.CompletionContext
  ): vscode.ProviderResult<vscode.CompletionItem[] | vscode.CompletionList<vscode.CompletionItem>> {
    
    const linePrefix = document.lineAt(position).text.substr(0, position.character);
    const currentIndent = linePrefix.match(/^\s*/)?.[0] || '';
    const items: vscode.CompletionItem[] = [];

    // If the cell is completely empty or starting new line, provide DEFINE
    if (document.getText().trim() === '' || linePrefix.trim() === '') {
      const defineItem = new vscode.CompletionItem('DEFINE', vscode.CompletionItemKind.Keyword);
      defineItem.detail = 'Start a new SCL definition';
      defineItem.documentation = new vscode.MarkdownString('Start a new SCL definition with DEFINE keyword');
      defineItem.insertText = new vscode.SnippetString('DEFINE ${1|MODEL,ACTION,ROUTE,RULE|} ${2:name}');
      defineItem.sortText = '0';
      defineItem.preselect = true;
      items.push(defineItem);
    }

    // DEFINE MODEL completions
    if (linePrefix.includes('DEFINE MODEL')) {
      const modelTemplates = this.getModelTemplates();
      items.push(...modelTemplates);
    }

    // DEFINE ACTION completions
    if (linePrefix.includes('DEFINE ACTION')) {
      const actionTemplates = this.getActionTemplates();
      items.push(...actionTemplates);
    }

    // DEFINE ROUTE completions
    if (linePrefix.includes('DEFINE ROUTE')) {
      const routeTemplates = this.getRouteTemplates();
      items.push(...routeTemplates);
    }

    // Model field completions
    if (this.isInModelContext(document, position)) {
      items.push(...this.getModelFieldCompletions());
    }

    // Action trigger completions
    if (this.isInActionContext(document, position)) {
      items.push(...this.getActionCompletions(linePrefix));
    }

    // Data type completions
    if (linePrefix.includes('ADD ')) {
      items.push(...this.getDataTypeCompletions());
    }

    // Database route type completions
    if (linePrefix.includes('WITH TYPE')) {
      items.push(...this.getDatabaseTypeCompletions());
    }

    // Topic pattern completions
    if (linePrefix.includes('TOPIC "')) {
      items.push(...this.getTopicPatternCompletions());
    }

    return items;
  }

  private getModelTemplates(): vscode.CompletionItem[] {
    const templates: vscode.CompletionItem[] = [];

    // Basic Model Template
    const basicModel = new vscode.CompletionItem('Basic Model', vscode.CompletionItemKind.Snippet);
    basicModel.detail = 'Basic model with fields';
    basicModel.insertText = new vscode.SnippetString(
      `DEFINE MODEL \${1:ModelName} WITH TOPIC "\${2:topic}"
    ADD STRING "\${3:fieldName}"
    ADD OBJECT "\${4:payload}"`
    );
    templates.push(basicModel);

    // Kafka Message Model Template
    const kafkaModel = new vscode.CompletionItem('Kafka Message Model', vscode.CompletionItemKind.Snippet);
    kafkaModel.detail = 'Standard Kafka message model';
    kafkaModel.insertText = new vscode.SnippetString(
      `DEFINE MODEL \${1:KafkaMessage} COLLAPSED
    ADD STRING "componentId"
    ADD STRING "topic"
    ADD OBJECT "payload"`
    );
    templates.push(kafkaModel);

    // Machine Data Model Template
    const machineModel = new vscode.CompletionItem('Machine Data Model', vscode.CompletionItemKind.Snippet);
    machineModel.detail = 'Model for machine/sensor data with database storage';
    machineModel.insertText = new vscode.SnippetString(
      `DEFINE MODEL \${1:MachineData} WITH TOPIC "\${2:Simulator/Machine/+/Data}"
    ADD "energy" WITH TOPIC "raw_data/+" AS TRIGGER
    ADD "device_name" WITH REPLACE "+" WITH TOPIC POSITION 2 IN "+"
    ADD "energy_wh" WITH (energy * 1000)
    ADD "production_status" WITH (IF energy > 5 THEN "active" ELSE "inactive")
    ADD "timestamp" WITH TIMESTAMP "UTC"
    STORE IN "\${3:mongo_route}"
        WITH TABLE "\${4:MachineProductionData}"`
    );
    templates.push(machineModel);

    return templates;
  }

  private getActionTemplates(): vscode.CompletionItem[] {
    const templates: vscode.CompletionItem[] = [];

    // Basic Topic Action
    const topicAction = new vscode.CompletionItem('Topic-based Action', vscode.CompletionItemKind.Snippet);
    topicAction.detail = 'Action triggered by topic message';
    topicAction.insertText = new vscode.SnippetString(
      `DEFINE ACTION \${1:ActionName}
ON TOPIC "\${2:topic/pattern}" DO
    SET "\${3:variable}" WITH \${4:expression}
    PUBLISH MODEL \${5:ModelName} TO (\${6:target_topic}) WITH
        \${7:field} = \${8:value}`
    );
    templates.push(topicAction);

    // Periodic Action
    const periodicAction = new vscode.CompletionItem('Periodic Action', vscode.CompletionItemKind.Snippet);
    periodicAction.detail = 'Action triggered periodically';
    periodicAction.insertText = new vscode.SnippetString(
      `DEFINE ACTION \${1:PeriodicAction}
ON EVERY \${2:30} \${3|SECONDS,MINUTES,HOURS|} DO
    SET "\${4:variable}" WITH \${5:expression}
    PUBLISH MODEL \${6:ModelName} TO (\${7:target_topic}) WITH
        \${8:field} = \${9:value}`
    );
    templates.push(periodicAction);

    // Component Processing Action
    const componentAction = new vscode.CompletionItem('Component Processing Action', vscode.CompletionItemKind.Snippet);
    componentAction.detail = 'Process component data with multiple units';
    componentAction.insertText = new vscode.SnippetString(
      `DEFINE ACTION \${1:ProcessComponents}
ON TOPIC "\${2:Raw/Components/+/+}" DO
    SET "systemId" WITH (GET JSON "info" IN PAYLOAD AS STRING)
    SET "topicv" WITH ("Components/" + TOPIC POSITION 3 + "/" + TOPIC POSITION 4 + "/" + {systemId})
    
    PUBLISH MODEL \${3:KafkaMessage} TO ({topicv}+"/Unit1") WITH
        componentId = (TOPIC POSITION 3 + "_" + TOPIC POSITION 4 + "_" + {systemId} + "_" + "Unit1")
        topic = ({topicv}+"/Unit1")
        payload = (GET JSON "Unit1" IN PAYLOAD AS STRING)`
    );
    templates.push(componentAction);

    return templates;
  }

  private getRouteTemplates(): vscode.CompletionItem[] {
    const templates: vscode.CompletionItem[] = [];

    // MongoDB Route
    const mongoRoute = new vscode.CompletionItem('MongoDB Route', vscode.CompletionItemKind.Snippet);
    mongoRoute.detail = 'MongoDB database connection route';
    mongoRoute.insertText = new vscode.SnippetString(
      `DEFINE ROUTE \${1:mongo_route} WITH TYPE MONGODB
    ADD MONGODB_CONFIG
        WITH CONNECTION_STRING "\${2:mongodb+srv://<username>:<password>@<cluster-uri>/<database>}"
        WITH DATABASE "\${3:database_name}"`
    );
    templates.push(mongoRoute);

    // PostgreSQL Route
    const postgresRoute = new vscode.CompletionItem('PostgreSQL Route', vscode.CompletionItemKind.Snippet);
    postgresRoute.detail = 'PostgreSQL database connection route';
    postgresRoute.insertText = new vscode.SnippetString(
      `DEFINE ROUTE \${1:postgres_route} WITH TYPE POSTGRESQL
    ADD POSTGRESQL_CONFIG
        WITH CONNECTION_STRING "\${2:postgresql://<username>:<password>@<host>:<port>/<database>}"
        WITH DATABASE "\${3:database_name}"`
    );
    templates.push(postgresRoute);

    // InfluxDB Route
    const influxRoute = new vscode.CompletionItem('InfluxDB Route', vscode.CompletionItemKind.Snippet);
    influxRoute.detail = 'InfluxDB time-series database route';
    influxRoute.insertText = new vscode.SnippetString(
      `DEFINE ROUTE \${1:influxdb_route} WITH TYPE INFLUXDB
    ADD INFLUXDB_CONFIG
        WITH CONNECTION_STRING "\${2:http://<host>:<port>}"
        WITH DATABASE "\${3:database_name}"
        WITH TOKEN "\${4:your_token}"`
    );
    templates.push(influxRoute);

    return templates;
  }

  private getModelFieldCompletions(): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    // ADD field completion
    const addField = new vscode.CompletionItem('ADD', vscode.CompletionItemKind.Keyword);
    addField.detail = 'Add a field to the model';
    addField.insertText = new vscode.SnippetString('ADD ${1|STRING,OBJECT,NUMBER,BOOLEAN,ARRAY|} "${2:fieldName}"${3: WITH ${4:expression}}');
    items.push(addField);

    // STORE completion
    const storeField = new vscode.CompletionItem('STORE IN', vscode.CompletionItemKind.Keyword);
    storeField.detail = 'Store model data in database';
    storeField.insertText = new vscode.SnippetString('STORE IN "${1:route_name}"\n    WITH TABLE "${2:table_name}"');
    items.push(storeField);

    return items;
  }

  private getActionCompletions(linePrefix: string): vscode.CompletionItem[] {
    const items: vscode.CompletionItem[] = [];

    // If no trigger defined yet, suggest ON
    if (!linePrefix.includes('ON ')) {
      const onItem = new vscode.CompletionItem('ON', vscode.CompletionItemKind.Keyword);
      onItem.detail = 'Define action trigger';
      onItem.insertText = new vscode.SnippetString('ON ${1|TOPIC,EVERY,TIMESTAMP|} ');
      items.push(onItem);
    }

    // Action statements
    const statements = [
      { keyword: 'SET', detail: 'Set a variable', template: 'SET "${1:variable}" WITH ${2:expression}' },
      { keyword: 'PUBLISH MODEL', detail: 'Publish using a model', template: 'PUBLISH MODEL ${1:ModelName} TO (${2:topic}) WITH\n    ${3:field} = ${4:value}' },
      { keyword: 'IF', detail: 'Conditional statement', template: 'IF(${1:condition}) THEN\n    ${2:action}\nELSE\n    ${3:alternative}' },
      { keyword: 'REPEAT', detail: 'Loop statement', template: 'REPEAT\n    ${1:action}\nUNTIL (${2:condition})' },
    ];

    for (const stmt of statements) {
      const item = new vscode.CompletionItem(stmt.keyword, vscode.CompletionItemKind.Keyword);
      item.detail = stmt.detail;
      item.insertText = new vscode.SnippetString(stmt.template);
      items.push(item);
    }

    return items;
  }

  private getDataTypeCompletions(): vscode.CompletionItem[] {
    const types = ['STRING', 'OBJECT', 'NUMBER', 'BOOLEAN', 'ARRAY'];
    return types.map(type => {
      const item = new vscode.CompletionItem(type, vscode.CompletionItemKind.Enum);
      item.detail = `${type} data type`;
      return item;
    });
  }

  private getDatabaseTypeCompletions(): vscode.CompletionItem[] {
    const types = ['MONGODB', 'POSTGRESQL', 'MYSQL', 'INFLUXDB', 'TIMESCALEDB'];
    return types.map(type => {
      const item = new vscode.CompletionItem(type, vscode.CompletionItemKind.Enum);
      item.detail = `${type} database type`;
      return item;
    });
  }

  private getTopicPatternCompletions(): vscode.CompletionItem[] {
    const patterns = [
      { pattern: 'sensor/+/temperature', description: 'Single level wildcard for sensor data' },
      { pattern: 'Raw/Components/+/+', description: 'Multi-level component data pattern' },
      { pattern: 'Simulator/Machine/+/Data', description: 'Machine data pattern' },
      { pattern: 'IoT/+/Status', description: 'IoT device status pattern' },
      { pattern: 'Environment/+/Monitoring', description: 'Environmental monitoring pattern' },
    ];

    return patterns.map(p => {
      const item = new vscode.CompletionItem(p.pattern, vscode.CompletionItemKind.Value);
      item.detail = p.description;
      item.insertText = p.pattern;
      return item;
    });
  }

  private isInModelContext(document: vscode.TextDocument, position: vscode.Position): boolean {
    // Look backwards for DEFINE MODEL
    for (let i = position.line; i >= 0; i--) {
      const line = document.lineAt(i).text.trim();
      if (line.startsWith('DEFINE MODEL')) {
        return true;
      }
      if (line.startsWith('DEFINE ') && !line.startsWith('DEFINE MODEL')) {
        return false;
      }
    }
    return false;
  }

  private isInActionContext(document: vscode.TextDocument, position: vscode.Position): boolean {
    // Look backwards for DEFINE ACTION
    for (let i = position.line; i >= 0; i--) {
      const line = document.lineAt(i).text.trim();
      if (line.startsWith('DEFINE ACTION')) {
        return true;
      }
      if (line.startsWith('DEFINE ') && !line.startsWith('DEFINE ACTION')) {
        return false;
      }
    }
    return false;
  }
}