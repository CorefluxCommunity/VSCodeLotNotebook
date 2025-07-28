// src/parsers/LOTParser.ts
// Simple parser for LOT → IR

import {
  Program, ActionDefinition, ModelDefinition, RuleDefinition,
  VariableDeclaration, Statement, Expression, DataTypeInfo,
  SetStatement, PublishStatement, IfStatement,
  VariableRef, Constant, BinaryOperation, SourceLocation,
  TopicTrigger, TimerTrigger, CallTrigger, UnknownNode
} from '../IR/TranslationIR';

export interface LOTToken {
  type: 'KEYWORD' | 'IDENTIFIER' | 'STRING' | 'NUMBER' | 'OPERATOR' | 'DELIMITER' | 'EOF';
  value: string;
  line: number;
  column: number;
}

export class LOTLexer {
  private text: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;

  private keywords = new Set([
    'DEFINE', 'ACTION', 'MODEL', 'RULE', 'ON', 'TOPIC', 'EVERY', 'DO',
    'SET', 'WITH', 'PUBLISH', 'IF', 'THEN', 'ELSE', 'END_IF',
    'GET', 'JSON', 'IN', 'PAYLOAD', 'AS', 'STRING', 'NUMBER', 'BOOLEAN',
    'SECOND', 'SECONDS', 'MINUTE', 'MINUTES', 'HOUR', 'HOURS',
    'ADD', 'TIMESTAMP', 'UTC', 'IS', 'NOT', 'NULL', 'AND', 'OR'
  ]);

  constructor(text: string) {
    this.text = text;
  }

  tokenize(): LOTToken[] {
    const tokens: LOTToken[] = [];
    
    while (this.pos < this.text.length) {
      this.skipWhitespaceAndComments();
      
      if (this.pos >= this.text.length) break;
      
      const token = this.nextToken();
      if (token) {
        tokens.push(token);
      }
    }
    
    tokens.push({ type: 'EOF', value: '', line: this.line, column: this.column });
    return tokens;
  }

  private skipWhitespaceAndComments(): void {
    while (this.pos < this.text.length) {
      const char = this.text[this.pos];
      
      if (char === ' ' || char === '\t') {
        this.pos++;
        this.column++;
      } else if (char === '\n') {
        this.pos++;
        this.line++;
        this.column = 1;
      } else if (char === '\r') {
        this.pos++;
        if (this.text[this.pos] === '\n') {
          this.pos++;
        }
        this.line++;
        this.column = 1;
      } else if (this.text.substr(this.pos, 2) === '//') {
        // Single line comment
        while (this.pos < this.text.length && this.text[this.pos] !== '\n') {
          this.pos++;
          this.column++;
        }
      } else {
        break;
      }
    }
  }

  private nextToken(): LOTToken | null {
    const startLine = this.line;
    const startColumn = this.column;
    const char = this.text[this.pos];

    // Numbers
    if (this.isDigit(char)) {
      return this.readNumber(startLine, startColumn);
    }

    // Strings
    if (char === '"' || char === "'") {
      return this.readString(startLine, startColumn);
    }

    // Identifiers and keywords
    if (this.isLetter(char) || char === '_') {
      return this.readIdentifier(startLine, startColumn);
    }

    // Operators and delimiters
    return this.readOperatorOrDelimiter(startLine, startColumn);
  }

  private readNumber(line: number, column: number): LOTToken {
    let value = '';
    while (this.pos < this.text.length && (this.isDigit(this.text[this.pos]) || this.text[this.pos] === '.')) {
      value += this.text[this.pos];
      this.pos++;
      this.column++;
    }
    return { type: 'NUMBER', value, line, column };
  }

  private readString(line: number, column: number): LOTToken {
    const quote = this.text[this.pos];
    let value = '';
    this.pos++; // Skip opening quote
    this.column++;
    
    while (this.pos < this.text.length && this.text[this.pos] !== quote) {
      value += this.text[this.pos];
      this.pos++;
      this.column++;
    }
    
    if (this.pos < this.text.length) {
      this.pos++; // Skip closing quote
      this.column++;
    }
    
    return { type: 'STRING', value, line, column };
  }

  private readIdentifier(line: number, column: number): LOTToken {
    let value = '';
    while (this.pos < this.text.length && (this.isAlphaNumeric(this.text[this.pos]) || this.text[this.pos] === '_')) {
      value += this.text[this.pos];
      this.pos++;
      this.column++;
    }
    
    const type = this.keywords.has(value.toUpperCase()) ? 'KEYWORD' : 'IDENTIFIER';
    return { type, value: value.toUpperCase(), line, column };
  }

  private readOperatorOrDelimiter(line: number, column: number): LOTToken {
    const char = this.text[this.pos];
    let value = char;
    this.pos++;
    this.column++;

    const operators = ['+', '-', '*', '/', '=', '<', '>', '{', '}'];
    const delimiters = ['(', ')', '[', ']', ';', ':', ',', '.'];

    if (operators.includes(value)) {
      return { type: 'OPERATOR', value, line, column };
    } else if (delimiters.includes(value)) {
      return { type: 'DELIMITER', value, line, column };
    } else {
      return { type: 'IDENTIFIER', value, line, column };
    }
  }

  private isDigit(char: string): boolean {
    return char >= '0' && char <= '9';
  }

  private isLetter(char: string): boolean {
    return (char >= 'a' && char <= 'z') || (char >= 'A' && char <= 'Z');
  }

  private isAlphaNumeric(char: string): boolean {
    return this.isLetter(char) || this.isDigit(char);
  }
}

export class LOTParser {
  private tokens: LOTToken[];
  private pos: number = 0;

  constructor(tokens: LOTToken[]) {
    this.tokens = tokens;
  }

  parse(): Program {
    const elements: (ActionDefinition | ModelDefinition | RuleDefinition | UnknownNode)[] = [];

    while (!this.isAtEnd()) {
      try {
        const element = this.parseTopLevelElement();
        if (element) {
          elements.push(element);
        }
      } catch (error) {
        const unknownNode: UnknownNode = {
          type: 'Unknown',
          originalLanguage: 'LOT',
          constructType: 'TopLevelElement',
          originalText: this.getCurrentToken().value,
          errorMessage: error instanceof Error ? error.message : 'Parse error'
        };
        elements.push(unknownNode);
        this.advance();
      }
    }

    return {
      type: 'Program',
      name: 'LOTProgram',
      elements,
      sourceLanguage: 'LOT'
    };
  }

  private parseTopLevelElement(): ActionDefinition | ModelDefinition | RuleDefinition | null {
    if (!this.check('DEFINE')) {
      this.advance();
      return null;
    }

    this.advance(); // consume DEFINE

    const nextToken = this.getCurrentToken().value;
    if (nextToken === 'ACTION') {
      return this.parseAction();
    } else if (nextToken === 'MODEL') {
      return this.parseModel();
    } else if (nextToken === 'RULE') {
      return this.parseRule();
    } else {
      this.advance();
      return null;
    }
  }

  private parseAction(): ActionDefinition {
    this.expect('ACTION');
    const name = this.expectIdentifier();

    // Parse trigger
    this.expect('ON');
    const trigger = this.parseTrigger();

    this.expect('DO');

    // Parse statements
    const body: Statement[] = [];
    while (!this.isAtEnd() && !this.check('DEFINE')) {
      const stmt = this.parseStatement();
      if (stmt) {
        body.push(stmt);
      }
    }

    return {
      type: 'ActionDefinition',
      name,
      trigger,
      inputVariables: [],
      outputVariables: [],
      localVariables: [],
      body
    };
  }

  private parseModel(): ModelDefinition {
    this.expect('MODEL');
    const name = this.expectIdentifier();

    // Skip any additional clauses for now
    while (!this.isAtEnd() && !this.check('DEFINE') && !this.check('ADD')) {
      this.advance();
    }

    const fields: any[] = [];
    while (this.check('ADD')) {
      this.advance(); // consume ADD
      // Skip field parsing for now - just advance tokens
      while (!this.isAtEnd() && !this.check('ADD') && !this.check('DEFINE')) {
        this.advance();
      }
    }

    return {
      type: 'ModelDefinition',
      name,
      fields
    };
  }

  private parseRule(): RuleDefinition {
    this.expect('RULE');
    const name = this.expectIdentifier();

    // Parse condition
    this.expect('IF');
    const condition = this.parseExpression();
    this.expect('THEN');

    // Parse action
    const action: Statement[] = [];
    while (!this.isAtEnd() && !this.check('DEFINE')) {
      const stmt = this.parseStatement();
      if (stmt) {
        action.push(stmt);
      }
    }

    return {
      type: 'RuleDefinition',
      name,
      condition,
      action
    };
  }

  private parseTrigger(): TopicTrigger | TimerTrigger | CallTrigger {
    const token = this.getCurrentToken().value;

    if (token === 'TOPIC') {
      this.advance(); // consume TOPIC
      const topicPattern = this.expectString();
      return {
        type: 'Trigger',
        triggerType: 'Topic',
        topicPattern
      };
    } else if (token === 'EVERY') {
      this.advance(); // consume EVERY
      const interval = parseInt(this.expectNumber());
      
      // Handle unit (could be "SECOND", "SECONDS", "MINUTE", etc.) - check for both IDENTIFIER and KEYWORD
      let unit = 'SECONDS';
      if (!this.isAtEnd() && (this.getCurrentToken().type === 'IDENTIFIER' || this.getCurrentToken().type === 'KEYWORD')) {
        const unitToken = this.getCurrentToken().value;
        if (unitToken.includes('SECOND')) {
          unit = 'SECONDS';
        } else if (unitToken.includes('MINUTE')) {
          unit = 'MINUTES';
        } else if (unitToken.includes('HOUR')) {
          unit = 'HOURS';
        }
        this.advance(); // consume unit token
      }
      
      return {
        type: 'Trigger',
        triggerType: 'Timer',
        interval,
        unit: unit as any
      };
    } else {
      return {
        type: 'Trigger',
        triggerType: 'Call',
        callMethod: 'Manual'
      };
    }
  }

  private parseStatement(): Statement | null {
    const token = this.getCurrentToken().value;

    if (token === 'SET') {
      return this.parseSetStatement();
    } else if (token === 'PUBLISH') {
      return this.parsePublishStatement();
    } else if (token === 'IF') {
      return this.parseIfStatement();
    } else {
      this.advance(); // Skip unknown statements
      return null;
    }
  }

  private parseSetStatement(): SetStatement {
    this.expect('SET');
    const variable = this.expectString();
    this.expect('WITH');
    
    // Skip complex expression parsing for now
    let value = '';
    let parenCount = 0;
    while (!this.isAtEnd()) {
      const token = this.getCurrentToken();
      if (token.value === '(' || token.value === '{') {
        parenCount++;
      } else if (token.value === ')' || token.value === '}') {
        parenCount--;
        if (parenCount < 0) break;
      } else if (parenCount === 0 && (this.check('SET') || this.check('PUBLISH') || this.check('IF') || this.check('DEFINE') || this.check('ELSE') || this.check('END_IF'))) {
        break;
      }
      
      value += token.value + ' ';
      this.advance();
    }

    return {
      type: 'Statement',
      statementType: 'Set',
      variable,
      value: {
        type: 'Expression',
        exprType: 'Constant',
        value: value.trim(),
        dataType: 'STRING'
      } as Constant
    };
  }

  private parsePublishStatement(): PublishStatement {
    this.expect('PUBLISH');
    this.expect('TOPIC');
    const topic = this.expectString();
    this.expect('WITH');
    
    // Parse data expression
    let data = '';
    while (!this.isAtEnd() && !this.check('SET') && !this.check('PUBLISH') && !this.check('IF') && !this.check('DEFINE') && !this.check('ELSE') && !this.check('END_IF')) {
      data += this.getCurrentToken().value + ' ';
      this.advance();
    }

    return {
      type: 'Statement',
      statementType: 'Publish',
      topic: {
        type: 'Expression',
        exprType: 'Constant',
        value: topic,
        dataType: 'STRING'
      } as Constant,
      data: {
        type: 'Expression',
        exprType: 'Constant',
        value: data.trim(),
        dataType: 'STRING'
      } as Constant
    };
  }

  private parseIfStatement(): IfStatement {
    this.expect('IF');
    const condition = this.parseExpression();
    this.expect('THEN');

    const thenBranch: Statement[] = [];
    while (!this.check('ELSE') && !this.check('END_IF') && !this.isAtEnd()) {
      const stmt = this.parseStatement();
      if (stmt) {
        thenBranch.push(stmt);
      }
    }

    let elseBranch: Statement[] | undefined;
    if (this.check('ELSE')) {
      this.advance();
      elseBranch = [];
      while (!this.check('END_IF') && !this.isAtEnd()) {
        const stmt = this.parseStatement();
        if (stmt) {
          elseBranch.push(stmt);
        }
      }
    }

    if (this.check('END_IF')) {
      this.advance();
    }

    return {
      type: 'Statement',
      statementType: 'If',
      condition,
      thenBranch,
      elseBranch
    };
  }

  private parseExpression(): Expression {
    return this.parseComparison();
  }

  private parseComparison(): Expression {
    let expr = this.parsePrimary();

    while (this.check('EQUALS') || this.check('=') || this.check('<>') || this.check('!=') || 
           this.check('<') || this.check('>') || this.check('<=') || this.check('>=')) {
      const operator = this.advance().value;
      const right = this.parsePrimary();
      
      expr = {
        type: 'Expression',
        exprType: 'BinaryOp',
        operator: operator === 'EQUALS' ? '=' : operator,
        left: expr,
        right
      } as any;
    }

    return expr;
  }

  private parsePrimary(): Expression {
    // Handle GET TOPIC expressions
    if (this.check('GET')) {
      this.advance(); // consume GET
      
      if (this.check('TOPIC')) {
        this.advance(); // consume TOPIC
        
        // Expect topic name (string or identifier)
        let topicName = '';
        if (this.getCurrentToken().type === 'STRING') {
          topicName = this.advance().value;
        } else if (this.getCurrentToken().type === 'IDENTIFIER') {
          topicName = this.advance().value;
        } else {
          throw new Error(`Expected topic name after GET TOPIC, got '${this.getCurrentToken().value}'`);
        }
        
        return {
          type: 'Expression',
          exprType: 'TopicAccess',
          topicPattern: topicName
        } as any;
      }
      
      throw new Error(`Expected TOPIC after GET, got '${this.getCurrentToken().value}'`);
    }

    // Handle string literals
    if (this.getCurrentToken().type === 'STRING') {
      const value = this.advance().value;
      return {
        type: 'Expression',
        exprType: 'Constant',
        value,
        dataType: 'STRING'
      } as Constant;
    }

    // Handle identifiers/variables
    if (this.getCurrentToken().type === 'IDENTIFIER') {
      const name = this.advance().value;
      return {
        type: 'Expression',
        exprType: 'Variable',
        name
      } as any;
    }

    // Handle numbers
    if (this.getCurrentToken().type === 'NUMBER') {
      const value = parseFloat(this.advance().value);
      return {
        type: 'Expression',
        exprType: 'Constant',
        value,
        dataType: 'REAL'
      } as Constant;
    }

    // Handle parentheses
    if (this.check('(')) {
      this.advance(); // consume (
      const expr = this.parseExpression();
      this.expect(')');
      return expr;
    }

    // Fallback - treat as string constant
    const value = this.advance().value;
    return {
      type: 'Expression',
      exprType: 'Constant',
      value,
      dataType: 'STRING'
    } as Constant;
  }

  // Helper methods
  private getCurrentToken(): LOTToken {
    return this.tokens[this.pos];
  }

  private advance(): LOTToken {
    if (!this.isAtEnd()) this.pos++;
    return this.tokens[this.pos - 1];
  }

  private isAtEnd(): boolean {
    return this.getCurrentToken().type === 'EOF';
  }

  private check(type: string): boolean {
    if (this.isAtEnd()) return false;
    return this.getCurrentToken().value === type || this.getCurrentToken().type === type;
  }

  private expect(expected: string): void {
    if (this.check(expected)) {
      this.advance();
    } else {
      throw new Error(`Expected '${expected}', got '${this.getCurrentToken().value}'`);
    }
  }

  private expectIdentifier(): string {
    if (this.getCurrentToken().type === 'IDENTIFIER') {
      return this.advance().value;
    } else {
      throw new Error(`Expected identifier, got '${this.getCurrentToken().value}'`);
    }
  }

  private expectString(): string {
    if (this.getCurrentToken().type === 'STRING') {
      return this.advance().value;
    } else {
      throw new Error(`Expected string, got '${this.getCurrentToken().value}'`);
    }
  }

  private expectNumber(): string {
    const token = this.getCurrentToken();
    if (token.type === 'NUMBER') {
      return this.advance().value;
    } else if (token.type === 'IDENTIFIER' && /^\d+$/.test(token.value)) {
      // Handle numbers that were parsed as identifiers
      return this.advance().value;
    } else {
      throw new Error(`Expected number, got '${token.value}'`);
    }
  }
}

export function parseLOT(source: string): Program {
  const lexer = new LOTLexer(source);
  const tokens = lexer.tokenize();
  const parser = new LOTParser(tokens);
  return parser.parse();
}