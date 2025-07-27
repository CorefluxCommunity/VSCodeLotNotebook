// src/IR/TranslationIR.ts
// Intermediate Representation for SCL ↔ LOT Translation

export interface SourceLocation {
  line: number;
  column: number;
  file?: string;
}

export interface IRNode {
  type: string;
  sourceLocation?: SourceLocation;
  originalText?: string;
  metadata?: { [key: string]: any };
}

// ============================================================================
// Data Types
// ============================================================================

export type DataType = 
  | 'BOOL' | 'BYTE' | 'WORD' | 'DWORD' | 'LWORD'
  | 'SINT' | 'INT' | 'DINT' | 'LINT' 
  | 'USINT' | 'UINT' | 'UDINT' | 'ULINT'
  | 'REAL' | 'LREAL'
  | 'STRING' | 'WSTRING'
  | 'TIME' | 'DATE' | 'TIME_OF_DAY' | 'DATE_AND_TIME'
  | 'ARRAY' | 'STRUCT'
  | 'OBJECT' | 'NUMBER' | 'BOOLEAN'; // LOT equivalents

export interface DataTypeInfo extends IRNode {
  type: 'DataType';
  dataType: DataType;
  arraySize?: number;
  stringLength?: number;
}

// ============================================================================
// Variables and Fields
// ============================================================================

export interface VariableDeclaration extends IRNode {
  type: 'VariableDeclaration';
  name: string;
  dataType: DataTypeInfo;
  initialValue?: Expression;
  comment?: string;
  scope: 'INPUT' | 'OUTPUT' | 'IN_OUT' | 'LOCAL' | 'TEMP';
}

export interface StructField extends IRNode {
  type: 'StructField';
  name: string;
  dataType: DataTypeInfo;
  comment?: string;
}

// ============================================================================
// Expressions
// ============================================================================

export interface Expression extends IRNode {
  type: 'Expression';
  exprType: 'Variable' | 'Constant' | 'BinaryOp' | 'UnaryOp' | 'FunctionCall' | 'JsonAccess' | 'TopicAccess';
}

export interface VariableRef extends Expression {
  exprType: 'Variable';
  name: string;
}

export interface Constant extends Expression {
  exprType: 'Constant';
  value: string | number | boolean;
  dataType: DataType;
}

export interface BinaryOperation extends Expression {
  exprType: 'BinaryOp';
  operator: '+' | '-' | '*' | '/' | 'MOD' | 'AND' | 'OR' | 'XOR' | '=' | '<>' | '<' | '>' | '<=' | '>=';
  left: Expression;
  right: Expression;
}

export interface UnaryOperation extends Expression {
  exprType: 'UnaryOp';
  operator: 'NOT' | '-' | '+';
  operand: Expression;
}

export interface FunctionCall extends Expression {
  exprType: 'FunctionCall';
  functionName: string;
  arguments: Expression[];
}

export interface JsonAccess extends Expression {
  exprType: 'JsonAccess';
  jsonSource: Expression; // Usually a variable containing JSON
  path: string;
  asType?: DataType;
}

export interface TopicAccess extends Expression {
  exprType: 'TopicAccess';
  topicPattern: string;
  position?: number; // For TOPIC POSITION n
}

// ============================================================================
// Statements
// ============================================================================

export interface Statement extends IRNode {
  type: 'Statement';
  statementType: string;
}

export interface Assignment extends Statement {
  statementType: 'Assignment';
  target: VariableRef;
  value: Expression;
}

export interface IfStatement extends Statement {
  statementType: 'If';
  condition: Expression;
  thenBranch: Statement[];
  elseBranch?: Statement[];
}

export interface ForLoop extends Statement {
  statementType: 'ForLoop';
  variable: string;
  startValue: Expression;
  endValue: Expression;
  stepValue?: Expression;
  body: Statement[];
}

export interface WhileLoop extends Statement {
  statementType: 'WhileLoop';
  condition: Expression;
  body: Statement[];
}

export interface RepeatLoop extends Statement {
  statementType: 'RepeatLoop';
  body: Statement[];
  condition: Expression; // UNTIL condition
}

export interface CaseStatement extends Statement {
  statementType: 'Case';
  selector: Expression;
  cases: Array<{
    values: Expression[];
    statements: Statement[];
  }>;
  elseCase?: Statement[];
}

export interface PublishStatement extends Statement {
  statementType: 'Publish';
  topic: Expression;
  data: Expression;
  qos?: number;
  retain?: boolean;
}

export interface SetStatement extends Statement {
  statementType: 'Set';
  variable: string;
  value: Expression;
}

// ============================================================================
// Triggers
// ============================================================================

export interface Trigger extends IRNode {
  type: 'Trigger';
  triggerType: 'Topic' | 'Timer' | 'Event' | 'Call';
}

export interface TopicTrigger extends Trigger {
  triggerType: 'Topic';
  topicPattern: string;
}

export interface TimerTrigger extends Trigger {
  triggerType: 'Timer';
  interval: number;
  unit: 'MILLISECONDS' | 'SECONDS' | 'MINUTES' | 'HOURS' | 'DAYS';
}

export interface CallTrigger extends Trigger {
  triggerType: 'Call';
  callMethod: 'Manual' | 'Automatic' | 'Topic';
  callTopic?: string;
}

// ============================================================================
// Program Units
// ============================================================================

export interface StructDefinition extends IRNode {
  type: 'StructDefinition';
  name: string;
  fields: StructField[];
  comment?: string;
}

export interface ModelDefinition extends IRNode {
  type: 'ModelDefinition';
  name: string;
  fields: StructField[];
  topicPattern?: string;
  comment?: string;
}

export interface FunctionBlock extends IRNode {
  type: 'FunctionBlock';
  name: string;
  inputVariables: VariableDeclaration[];
  outputVariables: VariableDeclaration[];
  localVariables: VariableDeclaration[];
  body: Statement[];
  comment?: string;
}

export interface ActionDefinition extends IRNode {
  type: 'ActionDefinition';
  name: string;
  trigger: Trigger;
  inputVariables: VariableDeclaration[];
  outputVariables: VariableDeclaration[];
  localVariables: VariableDeclaration[];
  body: Statement[];
  comment?: string;
}

export interface FunctionDefinition extends IRNode {
  type: 'FunctionDefinition';
  name: string;
  returnType: DataTypeInfo;
  inputVariables: VariableDeclaration[];
  localVariables: VariableDeclaration[];
  body: Statement[];
  comment?: string;
}

export interface RuleDefinition extends IRNode {
  type: 'RuleDefinition';
  name: string;
  condition: Expression;
  action: Statement[];
  comment?: string;
}

// ============================================================================
// Unknown/Unsupported Constructs
// ============================================================================

export interface UnknownNode extends IRNode {
  type: 'Unknown';
  originalLanguage: 'SCL' | 'LOT';
  constructType: string;
  originalText: string;
  errorMessage?: string;
  suggestedAlternative?: string;
}

// ============================================================================
// Program/File Level
// ============================================================================

export interface Program extends IRNode {
  type: 'Program';
  name?: string;
  elements: (StructDefinition | ModelDefinition | FunctionBlock | ActionDefinition | FunctionDefinition | RuleDefinition | UnknownNode)[];
  sourceLanguage: 'SCL' | 'LOT';
  version?: string;
}

// ============================================================================
// Translation Context
// ============================================================================

export interface TranslationContext {
  sourceLanguage: 'SCL' | 'LOT';
  targetLanguage: 'SCL' | 'LOT';
  preserveComments: boolean;
  addExplanatoryComments: boolean;
  errorHandling: 'strict' | 'lenient' | 'skip';
  unknownConstructHandling: 'error' | 'comment' | 'skip';
}

export interface TranslationResult {
  success: boolean;
  program: Program;
  warnings: Array<{
    message: string;
    location?: SourceLocation;
    severity: 'info' | 'warning' | 'error';
  }>;
  unknownConstructs: UnknownNode[];
  generatedCode: string;
}