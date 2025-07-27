// src/generators/SCLGenerator.ts
// Generate SCL code from IR

import {
  Program, ActionDefinition, ModelDefinition, RuleDefinition,
  Statement, Expression, TimerTrigger, TopicTrigger, CallTrigger,
  SetStatement, PublishStatement, IfStatement, Constant,
  TranslationContext, UnknownNode
} from '../IR/TranslationIR';

export class SCLGenerator {
  private context: TranslationContext;
  private indentLevel: number = 0;
  private readonly indentSize: number = 4;

  constructor(context: TranslationContext) {
    this.context = context;
  }

  generate(program: Program): string {
    const output: string[] = [];

    if (this.context.addExplanatoryComments) {
      output.push('(* LOT to SCL Translation for Control Engineers *)');
      output.push('(* This shows how LOT concepts map back to familiar SCL patterns *)');
      output.push('');
    }

    for (const element of program.elements) {
      const generated = this.generateElement(element);
      if (generated.trim()) {
        output.push(generated);
        output.push(''); // Add blank line between elements
      }
    }

    return output.join('\n');
  }

  private generateElement(element: any): string {
    switch (element.type) {
      case 'ActionDefinition':
        return this.generateActionAsVariablesAndCode(element as ActionDefinition);
      case 'ModelDefinition':
        return this.generateModelAsStruct(element as ModelDefinition);
      case 'RuleDefinition':
        return this.generateRuleAsFunction(element as RuleDefinition);
      case 'Unknown':
        return this.generateUnknownNode(element as UnknownNode);
      default:
        return `(* Unknown element type: ${element.type} *)`;
    }
  }

  private generateModelAsStruct(model: ModelDefinition): string {
    const output: string[] = [];

    if (this.context.addExplanatoryComments) {
      output.push(`(* LOT MODEL "${model.name}" becomes SCL STRUCT *)`);
    }

    output.push(`TYPE ${model.name} :`);
    output.push(`STRUCT`);
    
    // Add some default fields since LOT models are more flexible
    output.push(`    topic : STRING[200];`);
    output.push(`    payload : STRING[1000];`);
    output.push(`    timestamp : STRING[50];`);
    output.push(`    isValid : BOOL;`);
    
    output.push(`END_STRUCT`);
    output.push(`END_TYPE`);

    return output.join('\n');
  }

  private generateActionAsVariablesAndCode(action: ActionDefinition): string {
    const output: string[] = [];

    if (this.context.addExplanatoryComments) {
      output.push(`(* LOT ACTION "${action.name}" becomes SCL variables and logic *)`);
    }

    // Generate timer variables if needed
    const timerVars = this.generateTimerVariables(action);
    if (timerVars) {
      output.push(timerVars);
    }

    // Generate the main code logic
    const codeLogic = this.generateActionLogic(action);
    if (codeLogic) {
      output.push(codeLogic);
    }

    return output.join('\n\n');
  }

  private generateTimerVariables(action: ActionDefinition): string | null {
    if (action.trigger.triggerType !== 'Timer') {
      return null;
    }

    const timerTrigger = action.trigger as TimerTrigger;
    const timerName = `tmr${timerTrigger.interval}${timerTrigger.unit.charAt(0).toLowerCase()}`;
    
    const output: string[] = [];
    output.push(`VAR`);
    output.push(`    ${timerName} : TON;`);
    
    if (this.context.addExplanatoryComments) {
      output.push(`    (* Timer for ${timerTrigger.interval} ${timerTrigger.unit.toLowerCase()} periodic trigger *)`);
    }
    
    output.push(`END_VAR`);

    return output.join('\n');
  }

  private generateActionLogic(action: ActionDefinition): string {
    const output: string[] = [];

    if (action.trigger.triggerType === 'Timer') {
      const timerTrigger = action.trigger as TimerTrigger;
      const timerName = `tmr${timerTrigger.interval}${timerTrigger.unit.charAt(0).toLowerCase()}`;
      const timeConstant = this.generateTimeConstant(timerTrigger.interval, timerTrigger.unit);

      if (this.context.addExplanatoryComments) {
        output.push(`(* LOT: ON EVERY ${timerTrigger.interval} ${timerTrigger.unit} DO *)`);
      }

      output.push(`${timerName}(IN := TRUE, PT := ${timeConstant});`);
      output.push(`IF ${timerName}.Q THEN`);
      output.push(`    ${timerName}(IN := FALSE);   (* retrigger *)`);
      output.push(`    ${timerName}(IN := TRUE);`);
      output.push('');

      // Generate the action body
      for (const statement of action.body) {
        const sclStatement = this.generateStatement(statement, 1);
        if (sclStatement.trim()) {
          output.push(sclStatement);
        }
      }

      output.push(`END_IF;`);

    } else if (action.trigger.triggerType === 'Topic') {
      const topicTrigger = action.trigger as TopicTrigger;

      if (this.context.addExplanatoryComments) {
        output.push(`(* LOT: ON TOPIC "${topicTrigger.topicPattern}" DO *)`);
        output.push(`(* Note: Topic triggers require MQTT interface in PLC *)`);
      }

      output.push(`IF NewMsg AND TopicMatch(sTopic, '${topicTrigger.topicPattern}') THEN`);

      for (const statement of action.body) {
        const sclStatement = this.generateStatement(statement, 1);
        if (sclStatement.trim()) {
          output.push(sclStatement);
        }
      }

      output.push(`END_IF;`);

    } else {
      // Manual call trigger
      if (this.context.addExplanatoryComments) {
        output.push(`(* LOT ACTION becomes manual call logic *)`);
      }

      output.push(`(* Call this block manually or from other logic *)`);
      for (const statement of action.body) {
        const sclStatement = this.generateStatement(statement, 0);
        if (sclStatement.trim()) {
          output.push(sclStatement);
        }
      }
    }

    return output.join('\n');
  }

  private generateStatement(statement: Statement, indentLevel: number): string {
    const indent = ' '.repeat(indentLevel * this.indentSize);

    switch (statement.statementType) {
      case 'Set':
        return this.generateSetStatement(statement as SetStatement, indent);
      case 'Publish':
        return this.generatePublishStatement(statement as PublishStatement, indent);
      case 'If':
        return this.generateIfStatement(statement as IfStatement, indent);
      default:
        return `${indent}(* Unsupported statement: ${statement.statementType} *)`;
    }
  }

  private generateSetStatement(setStmt: SetStatement, indent: string): string {
    const value = this.generateExpression(setStmt.value);
    
    let output = `${indent}${setStmt.variable} := ${value};`;
    
    if (this.context.addExplanatoryComments) {
      output += ` (* LOT: SET "${setStmt.variable}" WITH ${value} *)`;
    }
    
    return output;
  }

  private generatePublishStatement(publishStmt: PublishStatement, indent: string): string {
    const topic = this.generateExpression(publishStmt.topic);
    const data = this.generateExpression(publishStmt.data);
    
    let output = `${indent}PublishTopic(${topic}, ${data});`;
    
    if (this.context.addExplanatoryComments) {
      output += ` (* LOT: PUBLISH TOPIC ${topic} WITH ${data} *)`;
    }
    
    return output;
  }

  private generateIfStatement(ifStmt: IfStatement, indent: string): string {
    const output: string[] = [];
    const condition = this.generateExpression(ifStmt.condition);
    
    output.push(`${indent}IF ${condition} THEN`);
    
    if (this.context.addExplanatoryComments) {
      output[output.length - 1] += ` (* LOT: IF ${condition} THEN *)`;
    }

    // Generate THEN branch
    for (const statement of ifStmt.thenBranch) {
      output.push(this.generateStatement(statement, Math.floor(indent.length / this.indentSize) + 1));
    }

    // Generate ELSE branch if present
    if (ifStmt.elseBranch && ifStmt.elseBranch.length > 0) {
      output.push(`${indent}ELSE`);
      if (this.context.addExplanatoryComments) {
        output[output.length - 1] += ` (* LOT: ELSE *)`;
      }
      
      for (const statement of ifStmt.elseBranch) {
        output.push(this.generateStatement(statement, Math.floor(indent.length / this.indentSize) + 1));
      }
    }

    output.push(`${indent}END_IF;`);

    return output.join('\n');
  }

  private generateRuleAsFunction(rule: RuleDefinition): string {
    const output: string[] = [];

    if (this.context.addExplanatoryComments) {
      output.push(`(* LOT RULE "${rule.name}" becomes SCL FUNCTION *)`);
    }

    output.push(`FUNCTION ${rule.name} : BOOL`);
    output.push(`VAR_INPUT`);
    output.push(`    (* Add required inputs based on rule condition *)`);
    output.push(`    checkCondition : BOOL;`);
    output.push(`END_VAR`);
    output.push('');
    output.push(`BEGIN`);
    
    const condition = this.generateExpression(rule.condition);
    output.push(`    IF ${condition} THEN`);
    
    for (const statement of rule.action) {
      const sclStatement = this.generateStatement(statement, 2);
      if (sclStatement.trim()) {
        output.push(sclStatement);
      }
    }
    
    output.push(`        ${rule.name} := TRUE;`);
    output.push(`    ELSE`);
    output.push(`        ${rule.name} := FALSE;`);
    output.push(`    END_IF;`);
    output.push(`END_FUNCTION`);

    return output.join('\n');
  }

  private generateExpression(expression: Expression): string {
    if (expression.exprType === 'Constant') {
      const constant = expression as Constant;
      if (constant.dataType === 'STRING') {
        return `'${constant.value}'`;
      } else {
        return String(constant.value);
      }
    } else {
      // For complex expressions, just return the string representation
      return String((expression as any).value || 'UNKNOWN');
    }
  }

  private generateTimeConstant(interval: number, unit: string): string {
    switch (unit.toLowerCase()) {
      case 'seconds':
      case 'second':
        return `T#${interval}S`;
      case 'minutes':
      case 'minute':
        return `T#${interval}M`;
      case 'hours':
      case 'hour':
        return `T#${interval}H`;
      case 'milliseconds':
      case 'millisecond':
        return `T#${interval}MS`;
      default:
        return `T#${interval}S`;
    }
  }

  private generateUnknownNode(unknown: UnknownNode): string {
    const output: string[] = [];
    
    output.push(`(* UNSUPPORTED LOT CONSTRUCT: ${unknown.constructType} *)`);
    if (unknown.errorMessage) {
      output.push(`(* Error: ${unknown.errorMessage} *)`);
    }
    
    output.push(`(* Original LOT code: *)`);
    const originalLines = unknown.originalText.split('\n');
    for (const line of originalLines) {
      output.push(`(* ${line} *)`);
    }
    
    if (unknown.suggestedAlternative) {
      output.push(`(* Suggested alternative: ${unknown.suggestedAlternative} *)`);
    }

    return output.join('\n');
  }
}