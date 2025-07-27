// src/SCLTranslator.ts

import * as vscode from 'vscode';

// ============================================================================
// SCL to LOT Translator
// ============================================================================

export interface SCLStruct {
  name: string;
  topic?: string;
  fields: Array<{
    type: 'STRING' | 'WORD' | 'DWORD' | 'REAL' | 'BOOL' | 'ARRAY';
    name: string;
    value?: string;
    arraySize?: number;
  }>;
  // Legacy fields for compatibility
  collapsed?: boolean;
  storeConfig?: {
    route: string;
    table: string;
  };
}

export interface SCLFunctionBlock {
  name: string;
  inputs: Array<{
    name: string;
    type: 'BOOL' | 'WORD' | 'DWORD' | 'REAL' | 'STRING';
    comment?: string;
  }>;
  outputs: Array<{
    name: string;
    type: 'BOOL' | 'WORD' | 'DWORD' | 'REAL' | 'STRING';
    comment?: string;
  }>;
  variables: Array<{
    name: string;
    expression: string;
  }>;
  body: string[]; // SCL statements
  // Legacy fields for compatibility with existing parser
  trigger: { type: string; value: string; timeUnit?: string };
  conditions: any[];
  publications: any[];
  loops: any[];
}

export interface SCLRoute {
  name: string;
  type: 'MONGODB' | 'POSTGRESQL' | 'MYSQL' | 'INFLUXDB' | 'TIMESCALEDB';
  config: {
    connectionString: string;
    database: string;
    token?: string;
  };
}

export interface SCLRule {
  name: string;
  condition: string;
  actions: string[];
}

export class SCLTranslator {
  
  /**
   * Parse SCL code and convert to LOT format
   * NOTE: This is a bridge function - real SCL would need custom mapping to LOT
   */
  public static sclToLot(sclCode: string): string {
    // For now, return a comment explaining the integration approach
    return `(* SCL to LOT Integration *)
(* This SCL code would be used in a PLC system that interfaces with LOT via MQTT *)
(* The PLC would process data using SCL logic and publish results to MQTT topics *)
(* that are consumed by LOT actions and models *)

// Original SCL Code:
${sclCode.split('\n').map(line => `// ${line}`).join('\n')}

// Corresponding LOT integration would define:
// - MQTT topics for data exchange
// - LOT actions to process PLC data
// - LOT models to structure the data flow

DEFINE MODEL PlcIntegration WITH TOPIC "plc/data/+"
    ADD "timestamp" WITH TIMESTAMP "UTC"
    ADD "plcData" WITH PAYLOAD AS STRING
    ADD "processedBy" WITH "SCL_FUNCTION_BLOCK"

DEFINE ACTION ProcessPlcData
ON TOPIC "plc/data/+" DO
    // Process data received from PLC running SCL code
    PUBLISH TOPIC "lot/processed/data" WITH PAYLOAD`;
  }

  /**
   * Parse LOT code and convert to SCL format
   */
  public static lotToScl(lotCode: string): string {
    // This would parse existing LOT entities and convert them to SCL
    // For now, we'll implement a basic version
    const lines = lotCode.split('\n').map(line => line.trim()).filter(line => line);
    const entities: string[] = [];
    
    let i = 0;
    while (i < lines.length) {
      const line = lines[i];
      
      if (line.startsWith('DEFINE MODEL')) {
        const entity = this.parseLotModel(lines, i);
        entities.push(this.lotModelToScl(entity.entity));
        i = entity.nextIndex;
      } else if (line.startsWith('DEFINE ACTION')) {
        const entity = this.parseLotAction(lines, i);
        entities.push(this.lotActionToScl(entity.entity));
        i = entity.nextIndex;
      } else {
        i++;
      }
    }
    
    return entities.join('\n\n');
  }

  // ============================================================================
  // SCL Parsing Methods
  // ============================================================================

  private static parseModel(lines: string[], startIndex: number): { entity: SCLStruct; nextIndex: number } {
    const defineLine = lines[startIndex];
    const match = defineLine.match(/DEFINE MODEL (\w+)(?:\s+COLLAPSED)?(?:\s+WITH TOPIC "([^"]+)")?/);
    
    if (!match) {
      throw new Error(`Invalid model definition: ${defineLine}`);
    }

    const model: SCLStruct = {
      name: match[1],
      topic: match[2],
      fields: [],
      collapsed: defineLine.includes('COLLAPSED'),
    };

    let i = startIndex + 1;
    while (i < lines.length && !lines[i].startsWith('DEFINE') && !lines[i].startsWith('--')) {
      const line = lines[i];
      
      if (line.startsWith('ADD ')) {
        const addMatch = line.match(/ADD (STRING|OBJECT|NUMBER|BOOLEAN|ARRAY) "([^"]+)"(?:\s+WITH (.+))?/);
        if (addMatch) {
          model.fields.push({
            type: addMatch[1] as any,
            name: addMatch[2],
            value: addMatch[3],
          });
        }
      } else if (line.startsWith('STORE IN')) {
        const storeMatch = line.match(/STORE IN "([^"]+)"\s+WITH TABLE "([^"]+)"/);
        if (storeMatch) {
          model.storeConfig = {
            route: storeMatch[1],
            table: storeMatch[2],
          };
        }
      }
      i++;
    }

    return { entity: model, nextIndex: i };
  }

  private static parseAction(lines: string[], startIndex: number): { entity: SCLFunctionBlock; nextIndex: number } {
    const defineLine = lines[startIndex];
    const match = defineLine.match(/DEFINE ACTION (\w+)/);
    
    if (!match) {
      throw new Error(`Invalid action definition: ${defineLine}`);
    }

    const action: SCLFunctionBlock = {
      name: match[1],
      inputs: [],
      outputs: [],
      variables: [],
      body: [],
      trigger: { type: 'TOPIC', value: '' },
      conditions: [],
      publications: [],
      loops: [],
    };

    let i = startIndex + 1;
    while (i < lines.length && !lines[i].startsWith('DEFINE') && !lines[i].startsWith('--')) {
      const line = lines[i];
      
      if (line.startsWith('ON TOPIC')) {
        const triggerMatch = line.match(/ON TOPIC "([^"]+)" DO/);
        if (triggerMatch) {
          action.trigger = { type: 'TOPIC', value: triggerMatch[1] };
        }
      } else if (line.startsWith('ON EVERY')) {
        const everyMatch = line.match(/ON EVERY (\d+)\s*(\w+) DO/);
        if (everyMatch) {
          action.trigger = { 
            type: 'EVERY', 
            value: everyMatch[1],
            timeUnit: everyMatch[2]
          };
        }
      } else if (line.startsWith('SET ')) {
        const setMatch = line.match(/SET "([^"]+)" WITH (.+)/);
        if (setMatch) {
          action.variables.push({
            name: setMatch[1],
            expression: setMatch[2],
          });
        }
      } else if (line.startsWith('PUBLISH MODEL')) {
        const pubMatch = line.match(/PUBLISH MODEL (\w+) TO \(([^)]+)\) WITH/);
        if (pubMatch) {
          const publication = {
            model: pubMatch[1],
            topic: pubMatch[2],
            fields: {} as { [key: string]: string },
          };
          
          // Parse the WITH fields
          i++;
          while (i < lines.length && lines[i].includes('=')) {
            const fieldMatch = lines[i].match(/(\w+)\s*=\s*(.+)/);
            if (fieldMatch) {
              publication.fields[fieldMatch[1]] = fieldMatch[2];
            }
            i++;
          }
          i--; // Back up one since we'll increment at the end
          
          action.publications.push(publication);
        }
      } else if (line.startsWith('IF(')) {
        const condMatch = line.match(/IF\((.+)\) THEN/);
        if (condMatch) {
          const condition = {
            condition: condMatch[1],
            thenActions: [] as string[],
            elseActions: [] as string[],
          };
          
          // Parse THEN actions
          i++;
          while (i < lines.length && !lines[i].startsWith('ELSE') && !lines[i].startsWith('DEFINE')) {
            if (lines[i].trim()) {
              condition.thenActions.push(lines[i]);
            }
            i++;
          }
          
          // Parse ELSE actions if present
          if (i < lines.length && lines[i].startsWith('ELSE')) {
            i++;
            while (i < lines.length && !lines[i].startsWith('DEFINE')) {
              if (lines[i].trim()) {
                condition.elseActions!.push(lines[i]);
              }
              i++;
            }
          }
          
          i--; // Back up one
          action.conditions.push(condition);
        }
      } else if (line.startsWith('REPEAT')) {
        // Parse REPEAT loops
        const loop = {
          type: 'REPEAT' as const,
          conditions: [] as string[],
          actions: [] as string[],
        };
        
        i++;
        while (i < lines.length && !lines[i].startsWith('UNTIL')) {
          if (lines[i].trim()) {
            loop.actions.push(lines[i]);
          }
          i++;
        }
        
        if (i < lines.length && lines[i].startsWith('UNTIL')) {
          const untilMatch = lines[i].match(/UNTIL \((.+)\)/);
          if (untilMatch) {
            loop.conditions.push(untilMatch[1]);
          }
        }
        
        action.loops.push(loop);
      }
      
      i++;
    }

    return { entity: action, nextIndex: i };
  }

  private static parseRoute(lines: string[], startIndex: number): { entity: SCLRoute; nextIndex: number } {
    const defineLine = lines[startIndex];
    const match = defineLine.match(/DEFINE ROUTE (\w+) WITH TYPE (\w+)/);
    
    if (!match) {
      throw new Error(`Invalid route definition: ${defineLine}`);
    }

    const route: SCLRoute = {
      name: match[1],
      type: match[2] as any,
      config: {
        connectionString: '',
        database: '',
      },
    };

    let i = startIndex + 1;
    while (i < lines.length && !lines[i].startsWith('DEFINE') && !lines[i].startsWith('--')) {
      const line = lines[i];
      
      if (line.includes('CONNECTION_STRING')) {
        const connMatch = line.match(/WITH CONNECTION_STRING "([^"]+)"/);
        if (connMatch) {
          route.config.connectionString = connMatch[1];
        }
      } else if (line.includes('DATABASE')) {
        const dbMatch = line.match(/WITH DATABASE "([^"]+)"/);
        if (dbMatch) {
          route.config.database = dbMatch[1];
        }
      } else if (line.includes('TOKEN')) {
        const tokenMatch = line.match(/WITH TOKEN "([^"]+)"/);
        if (tokenMatch) {
          route.config.token = tokenMatch[1];
        }
      }
      
      i++;
    }

    return { entity: route, nextIndex: i };
  }

  private static parseRule(lines: string[], startIndex: number): { entity: SCLRule; nextIndex: number } {
    const defineLine = lines[startIndex];
    const match = defineLine.match(/DEFINE RULE (\w+)/);
    
    if (!match) {
      throw new Error(`Invalid rule definition: ${defineLine}`);
    }

    const rule: SCLRule = {
      name: match[1],
      condition: '',
      actions: [],
    };

    let i = startIndex + 1;
    while (i < lines.length && !lines[i].startsWith('DEFINE') && !lines[i].startsWith('--')) {
      const line = lines[i];
      
      if (line.startsWith('IF ')) {
        rule.condition = line.replace('IF ', '').replace(' THEN', '');
      } else if (rule.condition && line.trim()) {
        rule.actions.push(line);
      }
      
      i++;
    }

    return { entity: rule, nextIndex: i };
  }

  // ============================================================================
  // SCL to LOT Conversion Methods
  // ============================================================================

  private static modelToLot(model: SCLStruct): string {
    let lot = `DEFINE MODEL ${model.name}`;
    
    if (model.topic) {
      lot += `\n    WITH TOPIC "${model.topic}"`;
    }
    
    for (const field of model.fields) {
      lot += `\n    ADD ${field.type} "${field.name}"`;
      if (field.value) {
        lot += ` WITH ${field.value}`;
      }
    }
    
    if (model.storeConfig) {
      lot += `\n    STORE IN "${model.storeConfig.route}" WITH TABLE "${model.storeConfig.table}"`;
    }
    
    return lot;
  }

  private static actionToLot(action: SCLFunctionBlock): string {
    let lot = `DEFINE ACTION ${action.name}`;
    
    // Add trigger
    if (action.trigger.type === 'TOPIC') {
      lot += `\nON TOPIC "${action.trigger.value}" DO`;
    } else if (action.trigger.type === 'EVERY') {
      lot += `\nON EVERY ${action.trigger.value} ${action.trigger.timeUnit || 'SECONDS'} DO`;
    }
    
    // Add variables
    for (const variable of action.variables) {
      lot += `\n    SET "${variable.name}" WITH ${variable.expression}`;
    }
    
    // Add conditions
    for (const condition of action.conditions) {
      lot += `\n    IF (${condition.condition}) THEN`;
      for (const action of condition.thenActions) {
        lot += `\n        ${action}`;
      }
      if (condition.elseActions && condition.elseActions.length > 0) {
        lot += `\n    ELSE`;
        for (const action of condition.elseActions) {
          lot += `\n        ${action}`;
        }
      }
    }
    
    // Add publications
    for (const pub of action.publications) {
      lot += `\n    PUBLISH TOPIC ${pub.topic} WITH`;
      for (const [key, value] of Object.entries(pub.fields)) {
        lot += `\n        ${key} = ${value}`;
      }
    }
    
    // Add loops
    for (const loop of action.loops) {
      lot += `\n    REPEAT`;
      for (const loopAction of loop.actions) {
        lot += `\n        ${loopAction}`;
      }
      if (loop.conditions.length > 0) {
        lot += `\n    UNTIL (${loop.conditions.join(' AND ')})`;
      }
    }
    
    return lot;
  }

  private static routeToLot(route: SCLRoute): string {
    let lot = `DEFINE ROUTE ${route.name}`;
    lot += `\n    WITH TYPE ${route.type}`;
    lot += `\n    WITH CONNECTION_STRING "${route.config.connectionString}"`;
    lot += `\n    WITH DATABASE "${route.config.database}"`;
    
    if (route.config.token) {
      lot += `\n    WITH TOKEN "${route.config.token}"`;
    }
    
    return lot;
  }

  private static ruleToLot(rule: SCLRule): string {
    let lot = `DEFINE RULE ${rule.name}`;
    lot += `\nIF ${rule.condition} THEN`;
    
    for (const action of rule.actions) {
      lot += `\n    ${action}`;
    }
    
    return lot;
  }

  // ============================================================================
  // LOT to SCL Conversion Methods (Basic Implementation)
  // ============================================================================

  private static parseLotModel(lines: string[], startIndex: number): { entity: any; nextIndex: number } {
    // Basic LOT model parsing - to be expanded
    let i = startIndex;
    while (i < lines.length && !lines[i].startsWith('DEFINE')) {
      i++;
    }
    return { entity: {}, nextIndex: i };
  }

  private static parseLotAction(lines: string[], startIndex: number): { entity: any; nextIndex: number } {
    // Basic LOT action parsing - to be expanded
    let i = startIndex;
    while (i < lines.length && !lines[i].startsWith('DEFINE')) {
      i++;
    }
    return { entity: {}, nextIndex: i };
  }

  private static lotModelToScl(entity: any): string {
    // Basic conversion - to be expanded
    return "-- LOT to SCL conversion not fully implemented yet";
  }

  private static lotActionToScl(entity: any): string {
    // Basic conversion - to be expanded
    return "-- LOT to SCL conversion not fully implemented yet";
  }

  // ============================================================================
  // Utility Methods
  // ============================================================================

  /**
   * Validate SCL syntax
   */
  public static validateScl(sclCode: string): { isValid: boolean; errors: string[] } {
    const errors: string[] = [];
    const lines = sclCode.split('\n').map(line => line.trim()).filter(line => line);
    
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i];
      
      // Check for valid DEFINE statements
      if (line.startsWith('DEFINE ')) {
        const defineMatch = line.match(/DEFINE (MODEL|ACTION|RULE|ROUTE|VISU) (\w+)/);
        if (!defineMatch) {
          errors.push(`Line ${i + 1}: Invalid DEFINE statement: ${line}`);
        }
      }
      
      // Check for proper indentation in action blocks
      if (line.startsWith('    ') && !line.match(/^\s*(SET|IF|PUBLISH|ADD|STORE|REPEAT|UNTIL)/)) {
        errors.push(`Line ${i + 1}: Invalid indented statement: ${line}`);
      }
    }
    
    return {
      isValid: errors.length === 0,
      errors,
    };
  }

  /**
   * Format SCL code with proper indentation
   */
  public static formatScl(sclCode: string): string {
    const lines = sclCode.split('\n');
    const formatted: string[] = [];
    let indentLevel = 0;
    
    for (const line of lines) {
      const trimmed = line.trim();
      if (!trimmed) continue;
      
      // Decrease indent for certain keywords
      if (trimmed.startsWith('ELSE') || trimmed.startsWith('UNTIL')) {
        indentLevel = Math.max(0, indentLevel - 1);
      }
      
      // Add line with proper indentation
      const indent = '    '.repeat(indentLevel);
      formatted.push(indent + trimmed);
      
      // Increase indent after certain keywords
      if (trimmed.includes(' DO') || trimmed.startsWith('IF(') || trimmed.startsWith('REPEAT') || trimmed.startsWith('ELSE')) {
        indentLevel++;
      }
    }
    
    return formatted.join('\n');
  }
}