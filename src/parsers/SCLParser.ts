// src/parsers/SCLParser.ts
// Simple recursive descent parser for SCL → IR

import {
  Program, StructDefinition, FunctionBlock, FunctionDefinition,
  VariableDeclaration, StructField, Statement, Expression,
  DataTypeInfo, DataType, Assignment, IfStatement, ForLoop,
  VariableRef, Constant, BinaryOperation, SourceLocation, UnknownNode
} from '../IR/TranslationIR';

export interface Token {
  type: 'KEYWORD' | 'IDENTIFIER' | 'NUMBER' | 'STRING' | 'OPERATOR' | 'DELIMITER' | 'EOF';
  value: string;
  line: number;
  column: number;
}

export class SCLLexer {
  private text: string;
  private pos: number = 0;
  private line: number = 1;
  private column: number = 1;

  private keywords = new Set([
    'TYPE', 'STRUCT', 'END_STRUCT', 'END_TYPE',
    'FUNCTION_BLOCK', 'END_FUNCTION_BLOCK', 'FUNCTION', 'END_FUNCTION',
    'VAR', 'VAR_INPUT', 'VAR_OUTPUT', 'VAR_IN_OUT', 'VAR_TEMP', 'END_VAR',
    'BEGIN', 'END', 'IF', 'THEN', 'ELSE', 'ELSIF', 'END_IF',
    'FOR', 'TO', 'BY', 'DO', 'END_FOR', 'WHILE', 'END_WHILE',
    'REPEAT', 'UNTIL', 'END_REPEAT', 'CASE', 'OF', 'END_CASE',
    'BOOL', 'BYTE', 'WORD', 'DWORD', 'LWORD',
    'SINT', 'INT', 'DINT', 'LINT', 'USINT', 'UINT', 'UDINT', 'ULINT',
    'REAL', 'LREAL', 'STRING', 'WSTRING', 'TIME', 'DATE',
    'TRUE', 'FALSE', 'AND', 'OR', 'XOR', 'NOT', 'MOD',
    'TON', 'TOF', 'TP' // Timer function blocks
  ]);

  constructor(text: string) {
    this.text = text;
  }

  tokenize(): Token[] {
    const tokens: Token[] = [];
    
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
      } else if (this.text.substr(this.pos, 2) === '(*') {
        // Multi-line comment
        this.pos += 2;
        this.column += 2;
        while (this.pos < this.text.length - 1) {
          if (this.text.substr(this.pos, 2) === '*)') {
            this.pos += 2;
            this.column += 2;
            break;
          }
          if (this.text[this.pos] === '\n') {
            this.line++;
            this.column = 1;
          } else {
            this.column++;
          }
          this.pos++;
        }
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

  private nextToken(): Token | null {
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

  private readNumber(line: number, column: number): Token {
    let value = '';
    
    while (this.pos < this.text.length && (this.isDigit(this.text[this.pos]) || this.text[this.pos] === '.')) {
      value += this.text[this.pos];
      this.pos++;
      this.column++;
    }
    
    return { type: 'NUMBER', value, line, column };
  }

  private readString(line: number, column: number): Token {
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

  private readIdentifier(line: number, column: number): Token {
    let value = '';
    
    while (this.pos < this.text.length && (this.isAlphaNumeric(this.text[this.pos]) || this.text[this.pos] === '_')) {
      value += this.text[this.pos];
      this.pos++;
      this.column++;
    }
    
    // Check for time literals (T#1S, TIME#1S)
    if ((value.toUpperCase() === 'T' || value.toUpperCase() === 'TIME') && 
        this.pos < this.text.length && this.text[this.pos] === '#') {
      value += this.text[this.pos]; // Add '#'
      this.pos++;
      this.column++;
      
      // Read the time value and unit
      while (this.pos < this.text.length && 
             (this.isAlphaNumeric(this.text[this.pos]) || this.text[this.pos] === '.')) {
        value += this.text[this.pos];
        this.pos++;
        this.column++;
      }
      
      return { type: 'STRING', value: value.toUpperCase(), line, column }; // Treat as string literal
    }
    
    const type = this.keywords.has(value.toUpperCase()) ? 'KEYWORD' : 'IDENTIFIER';
    return { type, value: value.toUpperCase(), line, column };
  }

  private readOperatorOrDelimiter(line: number, column: number): Token {
    const char = this.text[this.pos];
    let value = char;
    this.pos++;
    this.column++;

    // Two-character operators
    if (this.pos < this.text.length) {
      const twoChar = char + this.text[this.pos];
      if (['<>', '<=', '>=', ':='].includes(twoChar)) {
        value = twoChar;
        this.pos++;
        this.column++;
      }
    }

    const operators = ['+', '-', '*', '/', '=', '<', '>', '<=', '>=', '<>', ':=', '&', '|'];
    const delimiters = ['(', ')', '[', ']', '{', '}', ';', ':', ',', '.'];

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

export class SCLParser {
  private tokens: Token[];
  private pos: number = 0;

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  parse(): Program {
    const elements: (StructDefinition | FunctionBlock | FunctionDefinition | UnknownNode)[] = [];

    while (!this.isAtEnd()) {
      try {
        const element = this.parseTopLevelElement();
        if (element) {
          elements.push(element);
        }
      } catch (error) {
        // Create unknown node for unparseable constructs
        const unknownNode: UnknownNode = {
          type: 'Unknown',
          originalLanguage: 'SCL',
          constructType: 'TopLevelElement',
          originalText: this.getCurrentToken().value,
          errorMessage: error instanceof Error ? error.message : 'Parse error'
        };
        elements.push(unknownNode);
        this.advance(); // Skip problematic token
      }
    }

    return {
      type: 'Program',
      name: 'SCLProgram',
      elements,
      sourceLanguage: 'SCL'
    };
  }

  private parseTopLevelElement(): StructDefinition | FunctionBlock | FunctionDefinition | null {
    const token = this.getCurrentToken();

    if (token.value === 'TYPE') {
      return this.parseStructDefinition();
    } else if (token.value === 'FUNCTION_BLOCK') {
      return this.parseFunctionBlock();
    } else if (token.value === 'FUNCTION') {
      return this.parseFunctionDefinition();
    } else if (token.value === 'VAR' || token.value === 'VAR_INPUT' || token.value === 'VAR_OUTPUT') {
      // Handle standalone VAR blocks as implicit function blocks
      return this.parseStandaloneVarBlock();
    } else {
      // Try to parse as executable statements (for code like timer logic)
      const statements = this.parseExecutableStatements();
      if (statements.length > 0) {
        // Wrap standalone executable code in an implicit function block
        return {
          type: 'FunctionBlock',
          name: 'ImplicitMain',
          inputVariables: [],
          outputVariables: [],
          localVariables: [],
          body: statements
        };
      }
      this.advance(); // Skip unknown tokens
      return null;
    }
  }

  private parseStandaloneVarBlock(): FunctionBlock {
    const inputVariables: VariableDeclaration[] = [];
    const outputVariables: VariableDeclaration[] = [];
    const localVariables: VariableDeclaration[] = [];

    // Parse VAR blocks
    while (this.check('VAR') || this.check('VAR_INPUT') || this.check('VAR_OUTPUT')) {
      const varType = this.getCurrentToken().value;
      this.advance(); // consume VAR keyword
      
      while (!this.check('END_VAR')) {
        const scope = varType === 'VAR_INPUT' ? 'INPUT' : 
                      varType === 'VAR_OUTPUT' ? 'OUTPUT' : 'LOCAL';
        const variable = this.parseVariableDeclaration(scope);
        if (variable) {
          if (varType === 'VAR_INPUT') {
            inputVariables.push(variable);
          } else if (varType === 'VAR_OUTPUT') {
            outputVariables.push(variable);
          } else {
            localVariables.push(variable);
          }
        }
      }
      
      this.expect('END_VAR');
    }

    // Parse executable statements that follow
    const body = this.parseExecutableStatements();

    return {
      type: 'FunctionBlock',
      name: 'StandaloneVarBlock',
      inputVariables,
      outputVariables,
      localVariables,
      body
    };
  }

  private parseExecutableStatements(): Statement[] {
    const statements: Statement[] = [];
    let lastPos = this.pos;
    
    while (!this.isAtEnd() && !this.check('END_FUNCTION_BLOCK') && !this.check('END_FUNCTION') && !this.check('TYPE') && !this.check('FUNCTION_BLOCK') && !this.check('FUNCTION')) {
      try {
        const stmt = this.parseStatement();
        if (stmt) {
          statements.push(stmt);
        }
        
        // Safety check to prevent infinite loops
        if (this.pos === lastPos) {
          this.advance(); // Force advancement if no progress was made
        }
        lastPos = this.pos;
        
      } catch (error) {
        // Skip problematic tokens
        this.advance();
        lastPos = this.pos;
      }
    }
    
    return statements;
  }

  private parseStructDefinition(): StructDefinition {
    this.expect('TYPE');
    const name = this.expectIdentifier();
    this.expect(':');
    this.expect('STRUCT');

    const fields: StructField[] = [];
    
    while (!this.check('END_STRUCT')) {
      const field = this.parseStructField();
      if (field) {
        fields.push(field);
      }
    }

    this.expect('END_STRUCT');
    this.expect('END_TYPE');

    return {
      type: 'StructDefinition',
      name,
      fields
    };
  }

  private parseStructField(): StructField | null {
    if (this.check('END_STRUCT')) {
      return null;
    }

    const name = this.expectIdentifier();
    this.expect(':');
    const dataType = this.parseDataType();
    this.expect(';');

    return {
      type: 'StructField',
      name,
      dataType
    };
  }

  private parseFunctionBlock(): FunctionBlock {
    this.expect('FUNCTION_BLOCK');
    const name = this.expectIdentifier();

    const inputVariables: VariableDeclaration[] = [];
    const outputVariables: VariableDeclaration[] = [];
    const localVariables: VariableDeclaration[] = [];
    const body: Statement[] = [];

    while (!this.check('END_FUNCTION_BLOCK')) {
      if (this.check('VAR_INPUT')) {
        this.advance();
        while (!this.check('END_VAR')) {
          const variable = this.parseVariableDeclaration('INPUT');
          if (variable) {
            inputVariables.push(variable);
          }
        }
        this.expect('END_VAR');
      } else if (this.check('VAR_OUTPUT')) {
        this.advance();
        while (!this.check('END_VAR')) {
          const variable = this.parseVariableDeclaration('OUTPUT');
          if (variable) {
            outputVariables.push(variable);
          }
        }
        this.expect('END_VAR');
      } else if (this.check('VAR')) {
        this.advance();
        while (!this.check('END_VAR')) {
          const variable = this.parseVariableDeclaration('LOCAL');
          if (variable) {
            localVariables.push(variable);
          }
        }
        this.expect('END_VAR');
      } else if (this.check('BEGIN')) {
        this.advance();
        while (!this.check('END_FUNCTION_BLOCK')) {
          const stmt = this.parseStatement();
          if (stmt) {
            body.push(stmt);
          }
        }
      } else {
        this.advance(); // Skip unknown tokens
      }
    }

    this.expect('END_FUNCTION_BLOCK');

    return {
      type: 'FunctionBlock',
      name,
      inputVariables,
      outputVariables,
      localVariables,
      body
    };
  }

  private parseFunctionDefinition(): FunctionDefinition {
    this.expect('FUNCTION');
    const name = this.expectIdentifier();
    this.expect(':');
    const returnType = this.parseDataType();

    const inputVariables: VariableDeclaration[] = [];
    const localVariables: VariableDeclaration[] = [];
    const body: Statement[] = [];

    while (!this.check('END_FUNCTION')) {
      if (this.check('VAR_INPUT')) {
        this.advance();
        while (!this.check('END_VAR')) {
          const variable = this.parseVariableDeclaration('INPUT');
          if (variable) {
            inputVariables.push(variable);
          }
        }
        this.expect('END_VAR');
      } else if (this.check('VAR')) {
        this.advance();
        while (!this.check('END_VAR')) {
          const variable = this.parseVariableDeclaration('LOCAL');
          if (variable) {
            localVariables.push(variable);
          }
        }
        this.expect('END_VAR');
      } else if (this.check('BEGIN')) {
        this.advance();
        while (!this.check('END_FUNCTION')) {
          const stmt = this.parseStatement();
          if (stmt) {
            body.push(stmt);
          }
        }
      } else {
        this.advance(); // Skip unknown tokens
      }
    }

    this.expect('END_FUNCTION');

    return {
      type: 'FunctionDefinition',
      name,
      returnType,
      inputVariables,
      localVariables,
      body
    };
  }

  private parseVariableDeclaration(scope: 'INPUT' | 'OUTPUT' | 'IN_OUT' | 'LOCAL' | 'TEMP'): VariableDeclaration | null {
    if (this.check('END_VAR')) {
      return null;
    }

    const name = this.expectIdentifier();
    this.expect(':');
    const dataType = this.parseDataType();
    this.expect(';');

    return {
      type: 'VariableDeclaration',
      name,
      dataType,
      scope
    };
  }

  private parseDataType(): DataTypeInfo {
    const token = this.getCurrentToken();
    let dataType: DataType;

    // Map SCL types to our DataType enum
    switch (token.value) {
      case 'BOOL': dataType = 'BOOL'; break;
      case 'BYTE': dataType = 'BYTE'; break;
      case 'WORD': dataType = 'WORD'; break;
      case 'DWORD': dataType = 'DWORD'; break;
      case 'LWORD': dataType = 'LWORD'; break;
      case 'SINT': dataType = 'SINT'; break;
      case 'INT': dataType = 'INT'; break;
      case 'DINT': dataType = 'DINT'; break;
      case 'LINT': dataType = 'LINT'; break;
      case 'USINT': dataType = 'USINT'; break;
      case 'UINT': dataType = 'UINT'; break;
      case 'UDINT': dataType = 'UDINT'; break;
      case 'ULINT': dataType = 'ULINT'; break;
      case 'REAL': dataType = 'REAL'; break;
      case 'LREAL': dataType = 'LREAL'; break;
      case 'STRING': dataType = 'STRING'; break;
      case 'WSTRING': dataType = 'WSTRING'; break;
      case 'TIME': dataType = 'TIME'; break;
      case 'DATE': dataType = 'DATE'; break;
      case 'TON': dataType = 'TON'; break;
      case 'TOF': dataType = 'TOF'; break;
      case 'TP': dataType = 'TP'; break;
      default:
        dataType = 'STRING'; // Default fallback
    }

    this.advance();

    return {
      type: 'DataType',
      dataType
    };
  }

  private parseStatement(): Statement | null {
    const token = this.getCurrentToken();

    if (token.value === 'IF') {
      return this.parseIfStatement();
    } else if (token.value === 'FOR') {
      return this.parseForLoop();
    } else if (token.type === 'IDENTIFIER') {
      // Look ahead to see if this is an assignment or function call
      const nextToken = this.tokens[this.pos + 1];
      if (nextToken && nextToken.value === ':=') {
        return this.parseAssignment();
      } else if (nextToken && nextToken.value === '(') {
        return this.parseFunctionCallStatement();
      } else {
                 // Could be a member access assignment (e.g., tmr.IN := TRUE)
         let lookahead = this.pos + 1;
         while (lookahead < this.tokens.length && this.tokens[lookahead].value !== ';' && this.tokens[lookahead].value !== ':=') {
           if (this.tokens[lookahead].value === ':=') {
             return this.parseAssignment();
           }
           lookahead++; // Fix: actually increment lookahead
           if (lookahead > this.pos + 10) break; // Safety limit
         }
         return this.parseAssignment(); // Default to assignment parsing
      }
    } else {
      this.advance(); // Skip unknown statements
      return null;
    }
  }

  private parseFunctionCallStatement(): Statement {
    const functionName = this.expectIdentifier();
    this.expect('(');
    
    const args: Expression[] = [];
    if (!this.check(')')) {
      do {
        // Handle named parameters (paramName := value) or positional (value)
        if (this.tokens[this.pos + 1] && this.tokens[this.pos + 1].value === ':=') {
          // Named parameter - skip the parameter name and :=
          this.advance(); // parameter name
          this.advance(); // :=
          args.push(this.parseExpression());
        } else {
          // Positional parameter
          args.push(this.parseExpression());
        }
      } while (this.match(','));
    }
    
    this.expect(')');
    this.expect(';');

    return {
      type: 'Statement',
      statementType: 'FunctionCall',
      functionName,
      arguments: args
    } as any; // Use any to bypass type checking temporarily
  }

  private parseIfStatement(): IfStatement {
    this.expect('IF');
    const condition = this.parseExpression();
    this.expect('THEN');

    const thenBranch: Statement[] = [];
    while (!this.check('ELSE') && !this.check('END_IF')) {
      const stmt = this.parseStatement();
      if (stmt) {
        thenBranch.push(stmt);
      }
    }

    let elseBranch: Statement[] | undefined;
    if (this.check('ELSE')) {
      this.advance();
      elseBranch = [];
      while (!this.check('END_IF')) {
        const stmt = this.parseStatement();
        if (stmt) {
          elseBranch.push(stmt);
        }
      }
    }

    this.expect('END_IF');

    return {
      type: 'Statement',
      statementType: 'If',
      condition,
      thenBranch,
      elseBranch
    };
  }

  private parseForLoop(): ForLoop {
    this.expect('FOR');
    const variable = this.expectIdentifier();
    this.expect(':=');
    const startValue = this.parseExpression();
    this.expect('TO');
    const endValue = this.parseExpression();
    this.expect('DO');

    const body: Statement[] = [];
    while (!this.check('END_FOR')) {
      const stmt = this.parseStatement();
      if (stmt) {
        body.push(stmt);
      }
    }

    this.expect('END_FOR');

    return {
      type: 'Statement',
      statementType: 'ForLoop',
      variable,
      startValue,
      endValue,
      body
    };
  }

  private parseAssignment(): Assignment {
    let targetName = this.expectIdentifier();
    
    // Handle member access (e.g., tmr1s.IN)
    if (this.check('.')) {
      this.advance(); // consume '.'
      const member = this.expectIdentifier();
      targetName = `${targetName}.${member}`;
    }
    
    const target: VariableRef = {
      type: 'Expression',
      exprType: 'Variable',
      name: targetName
    };
    
    this.expect(':=');
    const value = this.parseExpression();
    this.expect(';');

    return {
      type: 'Statement',
      statementType: 'Assignment',
      target,
      value
    };
  }

  private parseExpression(): Expression {
    return this.parseComparison();
  }

  private parseComparison(): Expression {
    let expr = this.parseArithmetic();

    while (this.match('=', '<>', '<', '>', '<=', '>=')) {
      const operator = this.previous().value as any;
      const right = this.parseArithmetic();
      expr = {
        type: 'Expression',
        exprType: 'BinaryOp',
        operator,
        left: expr,
        right
      } as BinaryOperation;
    }

    return expr;
  }

  private parseArithmetic(): Expression {
    let expr = this.parseTerm();

    while (this.match('+', '-')) {
      const operator = this.previous().value as any;
      const right = this.parseTerm();
      expr = {
        type: 'Expression',
        exprType: 'BinaryOp',
        operator,
        left: expr,
        right
      } as BinaryOperation;
    }

    return expr;
  }

  private parseTerm(): Expression {
    let expr = this.parsePrimary();

    while (this.match('*', '/', 'MOD')) {
      const operator = this.previous().value as any;
      const right = this.parsePrimary();
      expr = {
        type: 'Expression',
        exprType: 'BinaryOp',
        operator,
        left: expr,
        right
      } as BinaryOperation;
    }

    return expr;
  }

  private parsePrimary(): Expression {
    if (this.match('TRUE', 'FALSE')) {
      const value = this.previous().value === 'TRUE';
      return {
        type: 'Expression',
        exprType: 'Constant',
        value,
        dataType: 'BOOL'
      } as Constant;
    }

    if (this.getCurrentToken().type === 'NUMBER') {
      const value = parseFloat(this.advance().value);
      return {
        type: 'Expression',
        exprType: 'Constant',
        value,
        dataType: 'REAL'
      } as Constant;
    }

    if (this.getCurrentToken().type === 'STRING') {
      const value = this.advance().value;
      return {
        type: 'Expression',
        exprType: 'Constant',
        value,
        dataType: 'STRING'
      } as Constant;
    }

    if (this.getCurrentToken().type === 'IDENTIFIER') {
      const name = this.advance().value;
      
      // Check if this is a function call
      if (this.check('(')) {
        this.advance(); // consume '('
        const args: Expression[] = [];
        
        if (!this.check(')')) {
          do {
            // Handle named parameters (paramName := value) or positional (value)
            if (this.tokens[this.pos + 1] && this.tokens[this.pos + 1].value === ':=') {
              // Named parameter - skip the parameter name and :=
              this.advance(); // parameter name
              this.advance(); // :=
              args.push(this.parseExpression());
            } else {
              // Positional parameter
              args.push(this.parseExpression());
            }
          } while (this.match(','));
        }
        
        this.expect(')');
        
        return {
          type: 'Expression',
          exprType: 'FunctionCall',
          functionName: name,
          arguments: args
        } as any; // Use any to bypass type checking temporarily
      }
      
      // Check if this is a member access (e.g., tmr1s.Q)
      if (this.check('.')) {
        this.advance(); // consume '.'
        const member = this.expectIdentifier();
        return {
          type: 'Expression',
          exprType: 'Variable',
          name: `${name}.${member}`
        } as VariableRef;
      }
      
      return {
        type: 'Expression',
        exprType: 'Variable',
        name
      } as VariableRef;
    }

    if (this.match('(')) {
      const expr = this.parseExpression();
      this.expect(')');
      return expr;
    }

    throw new Error(`Unexpected token: ${this.getCurrentToken().value}`);
  }

  // Helper methods
  private getCurrentToken(): Token {
    return this.tokens[this.pos];
  }

  private previous(): Token {
    return this.tokens[this.pos - 1];
  }

  private advance(): Token {
    if (!this.isAtEnd()) this.pos++;
    return this.previous();
  }

  private isAtEnd(): boolean {
    return this.getCurrentToken().type === 'EOF';
  }

  private check(type: string): boolean {
    if (this.isAtEnd()) return false;
    return this.getCurrentToken().value === type || this.getCurrentToken().type === type;
  }

  private match(...types: string[]): boolean {
    for (const type of types) {
      if (this.check(type)) {
        this.advance();
        return true;
      }
    }
    return false;
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
}

export function parseSCL(source: string): Program {
  const lexer = new SCLLexer(source);
  const tokens = lexer.tokenize();
  const parser = new SCLParser(tokens);
  return parser.parse();
}