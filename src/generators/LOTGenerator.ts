// src/generators/LOTGenerator.ts
// Generate LOT code from IR with explanatory comments for control engineers

import {
  Program, StructDefinition, FunctionBlock, FunctionDefinition,
  VariableDeclaration, StructField, Statement, Expression,
  DataTypeInfo, Assignment, IfStatement, ForLoop, VariableRef,
  Constant, BinaryOperation, UnknownNode, TranslationContext,
  CallTrigger, TopicTrigger, TimerTrigger
} from '../IR/TranslationIR';

export class LOTGenerator {
  private context: TranslationContext;
  private indentLevel: number = 0;
  private readonly indentSize: number = 4;

  constructor(context: TranslationContext) {
    this.context = context;
  }

  generate(program: Program): string {
    const output: string[] = [];

    if (this.context.addExplanatoryComments) {
      output.push('// SCL to LOT Translation for Control Engineers');
      output.push('// This shows how your familiar SCL concepts map to LOT');
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
      case 'StructDefinition':
        return this.generateStructAsModel(element as StructDefinition);
      case 'FunctionBlock':
        return this.generateFunctionBlockAsAction(element as FunctionBlock);
      case 'FunctionDefinition':
        return this.generateFunctionAsRule(element as FunctionDefinition);
      case 'Unknown':
        return this.generateUnknownNode(element as UnknownNode);
      default:
        return `// Unknown element type: ${element.type}`;
    }
  }

  private generateStructAsModel(struct: StructDefinition): string {
    const output: string[] = [];

    if (this.context.addExplanatoryComments) {
      output.push(`// SCL STRUCT "${struct.name}" becomes LOT MODEL`);
    }

    output.push(`DEFINE MODEL ${struct.name}`);

    for (const field of struct.fields) {
      const lotType = this.mapDataTypeToLOT(field.dataType.dataType);
      const fieldLine = `    ADD ${lotType} "${field.name}"`;
      
      if (this.context.addExplanatoryComments) {
        output.push(`${fieldLine} // SCL: ${field.name} : ${field.dataType.dataType}`);
      } else {
        output.push(fieldLine);
      }
    }

    // Add timestamp for IoT data tracking
    if (this.context.addExplanatoryComments) {
      output.push('    ADD "timestamp" WITH TIMESTAMP "UTC" // Auto-added for data tracking');
    }

    return output.join('\n');
  }

  private generateFunctionBlockAsAction(fb: FunctionBlock): string {
    const output: string[] = [];

    if (this.context.addExplanatoryComments) {
      output.push(`// SCL FUNCTION_BLOCK "${fb.name}" becomes LOT ACTION`);
    }

    output.push(`DEFINE ACTION ${fb.name}`);

    // Check if this is a timer pattern (TON with retrigger logic)
    const timerPattern = this.detectTimerPattern(fb);
    if (timerPattern) {
      output.push(`ON EVERY ${timerPattern.interval} ${timerPattern.unit} DO`);
    } else {
      // Determine trigger based on inputs
      const triggerTopic = this.generateTriggerForFunctionBlock(fb);
      output.push(`ON TOPIC "${triggerTopic}" DO`);
    }

    // Generate input handling
    if (fb.inputVariables.length > 0) {
      if (this.context.addExplanatoryComments) {
        output.push('    // Extract inputs from MQTT payload');
      }
      
      for (const input of fb.inputVariables) {
        const lotType = this.mapDataTypeToLOT(input.dataType.dataType);
        if (this.context.addExplanatoryComments) {
          output.push(`    // SCL INPUT: ${input.name} : ${input.dataType.dataType}`);
        }
        output.push(`    SET "${input.name}" WITH (GET JSON "${input.name}" IN PAYLOAD AS ${lotType})`);
      }
      output.push('');
    }

    // Generate function block logic
    if (fb.body.length > 0) {
      if (this.context.addExplanatoryComments) {
        output.push('    // Original SCL logic translated to LOT:');
      }
      
      const filteredStatements = timerPattern ? 
        this.filterTimerManagementStatements(fb.body, fb.localVariables) : 
        fb.body;
      
      for (const statement of filteredStatements) {
        const lotStatement = this.generateStatement(statement, 1);
        if (lotStatement.trim()) {
          output.push(lotStatement);
        }
      }
      output.push('');
    }

    // Generate output publishing
    if (fb.outputVariables.length > 0) {
      if (this.context.addExplanatoryComments) {
        output.push('    // Publish outputs (SCL VAR_OUTPUT becomes LOT PUBLISH)');
      }
      
      for (const output_var of fb.outputVariables) {
        const topicName = `plc/output/${fb.name.toLowerCase()}/${output_var.name}`;
        let publishLine = `    PUBLISH TOPIC "${topicName}" WITH {${output_var.name}}`;
        
        if (this.context.addExplanatoryComments) {
          publishLine += ` // SCL OUTPUT: ${output_var.name} : ${output_var.dataType.dataType}`;
        }
        
        output.push(publishLine);
      }
    }

    return output.join('\n');
  }

  private generateFunctionAsRule(func: FunctionDefinition): string {
    const output: string[] = [];

    if (this.context.addExplanatoryComments) {
      output.push(`// SCL FUNCTION "${func.name}" becomes LOT RULE`);
    }

    output.push(`DEFINE RULE Calculate_${func.name}`);

    // Generate condition based on input parameters
    if (func.inputVariables.length > 0) {
      const conditions = func.inputVariables.map(input => `{${input.name}} IS NOT NULL`);
      output.push(`IF ${conditions.join(' AND ')} THEN`);
    } else {
      output.push('IF TRUE THEN');
    }

    // Generate function logic
    if (func.body.length > 0) {
      if (this.context.addExplanatoryComments) {
        output.push('    // Original SCL FUNCTION logic:');
      }
      
      for (const statement of func.body) {
        const lotStatement = this.generateStatement(statement, 1);
        if (lotStatement.trim()) {
          output.push(lotStatement);
        }
      }
    }

    // Generate return value handling
    const resultVar = `result_${func.name}`;
    const inputList = func.inputVariables.map(input => input.name).join(', ');
    
    if (this.context.addExplanatoryComments) {
      output.push(`    // Function result calculation`);
    }
    output.push(`    SET "${resultVar}" WITH (CALC_${func.name}({${inputList}}))`);
    
    if (this.context.addExplanatoryComments) {
      output.push(`    // Returns: ${func.returnType.dataType}`);
    }

    return output.join('\n');
  }

  private generateStatement(statement: Statement, indentLevel: number): string {
    const indent = ' '.repeat(indentLevel * this.indentSize);

    switch (statement.statementType) {
      case 'Assignment':
        return this.generateAssignment(statement as Assignment, indent);
      case 'If':
        return this.generateIfStatement(statement as IfStatement, indent);
      case 'ForLoop':
        return this.generateForLoop(statement as ForLoop, indent);
      case 'FunctionCall':
        return this.generateFunctionCall(statement as any, indent);
      default:
        return `${indent}// Unsupported statement: ${statement.statementType}`;
    }
  }

  private generateAssignment(assignment: Assignment, indent: string): string {
    const target = assignment.target.name;
    const value = this.generateExpression(assignment.value);
    
    let output = `${indent}SET "${target}" WITH (${value})`;
    
    if (this.context.addExplanatoryComments) {
      output += ` // SCL: ${target} := ${value}`;
    }
    
    return output;
  }

  private generateIfStatement(ifStmt: IfStatement, indent: string): string {
    const output: string[] = [];
    const condition = this.generateExpression(ifStmt.condition);
    
    output.push(`${indent}IF (${condition}) THEN`);
    
    if (this.context.addExplanatoryComments) {
      output[output.length - 1] += ` // SCL: IF ${condition} THEN`;
    }

    // Generate THEN branch
    for (const statement of ifStmt.thenBranch) {
      output.push(this.generateStatement(statement, Math.floor(indent.length / this.indentSize) + 1));
    }

    // Generate ELSE branch if present
    if (ifStmt.elseBranch && ifStmt.elseBranch.length > 0) {
      output.push(`${indent}ELSE`);
      if (this.context.addExplanatoryComments) {
        output[output.length - 1] += ` // SCL: ELSE`;
      }
      
      for (const statement of ifStmt.elseBranch) {
        output.push(this.generateStatement(statement, Math.floor(indent.length / this.indentSize) + 1));
      }
    }

    return output.join('\n');
  }

  private generateForLoop(forLoop: ForLoop, indent: string): string {
    const output: string[] = [];
    
    const startValue = this.generateExpression(forLoop.startValue);
    const endValue = this.generateExpression(forLoop.endValue);
    
    if (this.context.addExplanatoryComments) {
      output.push(`${indent}// SCL FOR loop converted to REPEAT/UNTIL`);
      output.push(`${indent}// FOR ${forLoop.variable} := ${startValue} TO ${endValue} DO`);
    }
    
    output.push(`${indent}SET "${forLoop.variable}" WITH (${startValue})`);
    output.push(`${indent}REPEAT`);
    
    // Generate loop body
    for (const statement of forLoop.body) {
      output.push(this.generateStatement(statement, Math.floor(indent.length / this.indentSize) + 1));
    }
    
    // Increment counter
    output.push(`${indent}    SET "${forLoop.variable}" WITH ({${forLoop.variable}} + 1)`);
    output.push(`${indent}UNTIL ({${forLoop.variable}} > ${endValue})`);

    return output.join('\n');
  }

  private generateExpression(expression: Expression): string {
    switch (expression.exprType) {
      case 'Variable':
        const varRef = expression as VariableRef;
        return `{${varRef.name}}`;
      
      case 'Constant':
        const constant = expression as Constant;
        if (constant.dataType === 'STRING') {
          return `"${constant.value}"`;
        } else if (constant.dataType === 'BOOL') {
          return constant.value ? 'TRUE' : 'FALSE';
        } else {
          return String(constant.value);
        }
      
      case 'BinaryOp':
        const binOp = expression as BinaryOperation;
        const left = this.generateExpression(binOp.left);
        const right = this.generateExpression(binOp.right);
        const operator = this.mapSCLOperatorToLOT(binOp.operator);
        return `${left} ${operator} ${right}`;
      
      case 'FunctionCall':
        const funcCall = expression as any;
        // Handle special LOT functions
        if (funcCall.functionName.toUpperCase() === 'GETTOPIC' && funcCall.arguments.length > 0) {
          const topicArg = this.generateExpression(funcCall.arguments[0]);
          // Remove quotes if it's a string literal
          const topic = topicArg.startsWith('"') && topicArg.endsWith('"') ? 
                       topicArg.slice(1, -1) : topicArg;
          return `GET TOPIC "${topic}"`;
        }
        return `${funcCall.functionName}(${funcCall.arguments.map((arg: any) => this.generateExpression(arg)).join(', ')})`;
      
      case 'TopicAccess':
        const topicAccess = expression as any;
        return `GET TOPIC "${topicAccess.topicPattern}"`;
      
      default:
        return 'UNKNOWN_EXPRESSION';
    }
  }

  private detectTimerPattern(fb: FunctionBlock): { interval: number; unit: string } | null {
    // Look for TON timer variables
    const timerVariable = fb.localVariables.find(variable => 
      variable.dataType.dataType === 'TON' || 
      variable.dataType.dataType === 'TOF' || 
      variable.dataType.dataType === 'TP'
    );
    
    if (!timerVariable) {
      return null;
    }
    
    // Look for timer pattern in the function block body:
    // 1. Timer call with PT parameter
    // 2. IF timer.Q THEN with retrigger logic
    let timerInterval: number | null = null;
    let timerUnit: string = 'SECOND';
    
    for (const statement of fb.body) {
      // Look for timer function calls with time constants
      if (statement.statementType === 'FunctionCall') {
        const funcCall = statement as any;
        if (funcCall.functionName.toUpperCase() === timerVariable.name.toUpperCase()) {
          // Check arguments for time literal (T#1S, T#500MS, etc.)
          for (const arg of funcCall.arguments) {
            if (arg.exprType === 'Constant' && typeof arg.value === 'string' && arg.value.startsWith('T#')) {
              const timeMatch = arg.value.match(/T#(\d+(?:\.\d+)?)([A-Z]+)/i);
              if (timeMatch) {
                const value = parseFloat(timeMatch[1]);
                const unit = timeMatch[2].toUpperCase();
                
                // Convert to LOT time units
                switch (unit) {
                  case 'MS':
                    timerInterval = value / 1000;
                    timerUnit = 'SECOND';
                    break;
                  case 'S':
                    timerInterval = value;
                    timerUnit = 'SECOND';
                    break;
                  case 'M':
                    timerInterval = value;
                    timerUnit = 'MINUTE';
                    break;
                  case 'H':
                    timerInterval = value;
                    timerUnit = 'HOUR';
                    break;
                  default:
                    timerInterval = value;
                    timerUnit = 'SECOND';
                }
              }
            }
          }
        }
      }
      
      // Look for retrigger pattern (IF timer.Q THEN timer(IN := FALSE); timer(IN := TRUE);)
      if (statement.statementType === 'If') {
        const ifStmt = statement as any;
        if (ifStmt.condition?.name === `${timerVariable.name.toUpperCase()}.Q`) {
          // This is likely a retrigger pattern for periodic execution
          if (timerInterval !== null) {
            return { interval: timerInterval, unit: timerUnit };
          }
        }
      }
    }
    
    return null;
  }

  private filterTimerManagementStatements(statements: Statement[], variables: VariableDeclaration[]): Statement[] {
    // Find timer variables
    const timerVariables = variables.filter(variable => 
      variable.dataType.dataType === 'TON' || 
      variable.dataType.dataType === 'TOF' || 
      variable.dataType.dataType === 'TP'
    ).map(v => v.name.toUpperCase());
    
    if (timerVariables.length === 0) {
      return statements;
    }
    
    const filtered: Statement[] = [];
    
    for (const statement of statements) {
      let shouldInclude = true;
      
      // Filter out timer function calls (tmr1s(IN := TRUE, PT := T#1S))
      if (statement.statementType === 'FunctionCall') {
        const funcCall = statement as any;
        if (timerVariables.includes(funcCall.functionName.toUpperCase())) {
          shouldInclude = false;
        }
      }
      
      // Filter out IF statements that are only for timer retrigger logic
      if (statement.statementType === 'If') {
        const ifStmt = statement as any;
        if (ifStmt.condition?.name && 
            timerVariables.some(timer => ifStmt.condition.name === `${timer}.Q`)) {
          // Check if the IF body only contains timer retrigger calls
          const timerCalls = ifStmt.thenBranch.filter((stmt: any) => {
            return stmt.statementType === 'FunctionCall' && 
                   timerVariables.includes(stmt.functionName.toUpperCase());
          });
          
          const nonTimerCalls = ifStmt.thenBranch.filter((stmt: any) => {
            return !(stmt.statementType === 'FunctionCall' && 
                     timerVariables.includes(stmt.functionName.toUpperCase()));
          });
          
          // If this IF statement has timer calls, we need to extract the non-timer parts
          const hasTimerCalls = timerCalls.length > 0;
          
          if (hasTimerCalls) {
            // Add non-timer statements directly (without the IF wrapper for timer-triggered logic)
            filtered.push(...nonTimerCalls);
            shouldInclude = false;
          }
        }
      }
      
      if (shouldInclude) {
        filtered.push(statement);
      }
    }
    
    return filtered;
  }

  private generateTriggerForFunctionBlock(fb: FunctionBlock): string {
    // Check if any input suggests MQTT/topic usage
    const hasMqttInput = fb.inputVariables.some(input => 
      input.name.toLowerCase().includes('mqtt') || 
      input.name.toLowerCase().includes('topic')
    );
    
    if (hasMqttInput) {
      return `plc/${fb.name.toLowerCase()}/+`;
    } else {
      return `plc/call/${fb.name.toLowerCase()}`;
    }
  }

  private generateUnknownNode(unknown: UnknownNode): string {
    const output: string[] = [];
    
    output.push(`// UNSUPPORTED SCL CONSTRUCT: ${unknown.constructType}`);
    if (unknown.errorMessage) {
      output.push(`// Error: ${unknown.errorMessage}`);
    }
    
    output.push(`// Original SCL code:`);
    const originalLines = unknown.originalText.split('\n');
    for (const line of originalLines) {
      output.push(`// ${line}`);
    }
    
    if (unknown.suggestedAlternative) {
      output.push(`// Suggested alternative: ${unknown.suggestedAlternative}`);
    }

    return output.join('\n');
  }

  private mapDataTypeToLOT(sclType: string): string {
    const typeMap: { [key: string]: string } = {
      'BOOL': 'BOOLEAN',
      'BYTE': 'NUMBER',
      'WORD': 'NUMBER',
      'DWORD': 'NUMBER',
      'LWORD': 'NUMBER',
      'SINT': 'NUMBER',
      'INT': 'NUMBER',
      'DINT': 'NUMBER',
      'LINT': 'NUMBER',
      'USINT': 'NUMBER',
      'UINT': 'NUMBER',
      'UDINT': 'NUMBER',
      'ULINT': 'NUMBER',
      'REAL': 'NUMBER',
      'LREAL': 'NUMBER',
      'STRING': 'STRING',
      'WSTRING': 'STRING',
      'TIME': 'STRING',
      'DATE': 'STRING',
      'ARRAY': 'ARRAY',
      'STRUCT': 'OBJECT'
    };

    return typeMap[sclType] || 'OBJECT';
  }

  private mapSCLOperatorToLOT(sclOperator: string): string {
    const operatorMap: { [key: string]: string } = {
      '=': '==',
      '<>': '!=',
      'AND': 'AND',
      'OR': 'OR',
      'XOR': 'XOR',
      'NOT': 'NOT',
      'MOD': '%',
      '+': '+',
      '-': '-',
      '*': '*',
      '/': '/',
      '<': '<',
      '>': '>',
      '<=': '<=',
      '>=': '>='
    };

    return operatorMap[sclOperator] || sclOperator;
  }

  private generateFunctionCall(functionCall: any, indent: string): string {
    const functionName = functionCall.functionName;
    const args = functionCall.arguments || [];
    
    // Handle specific PLC function calls
    if (functionName === 'PUBLISHTOPIC') {
      if (args.length >= 2) {
        const topic = this.generateExpression(args[0]);
        const data = this.generateExpression(args[1]);
        let output = `${indent}PUBLISH TOPIC ${topic} WITH ${data}`;
        
        if (this.context.addExplanatoryComments) {
          output += ` // SCL: PublishTopic(${topic}, ${data})`;
        }
        
        return output;
      }
    }
    
    // Handle timer function calls (TON, TOF, TP)
    if (functionName.toUpperCase().endsWith('TMR1S') || functionName.match(/^[A-Z_]+$/)) {
      let output = `${indent}// Timer operation: ${functionName}(`;
      for (let i = 0; i < args.length; i++) {
        if (i > 0) output += ', ';
        output += this.generateExpression(args[i]);
      }
      output += ')';
      
      if (this.context.addExplanatoryComments) {
        output += ` // SCL timer function block call`;
      }
      
      return output;
    }
    
    // Generic function call
    let output = `${indent}// Function call: ${functionName}(`;
    for (let i = 0; i < args.length; i++) {
      if (i > 0) output += ', ';
      output += this.generateExpression(args[i]);
    }
    output += ')';
    
    if (this.context.addExplanatoryComments) {
      output += ` // SCL: ${functionName}(...)`;
    }
    
    return output;
  }
}