# SCL ↔ LOT Translation Specification

## 1. Supported Language Subsets

### SCL Side (IEC 61131-3 Structured Text)
**Core Constructs We Support:**
- `TYPE name : STRUCT ... END_STRUCT END_TYPE` - Data structure definitions
- `FUNCTION_BLOCK name ... END_FUNCTION_BLOCK` - Function blocks with I/O
- `FUNCTION name : returnType ... END_FUNCTION` - Pure functions
- `VAR_INPUT`, `VAR_OUTPUT`, `VAR_IN_OUT`, `VAR` - Variable declarations
- `IF...THEN...ELSE...END_IF` - Conditional logic
- `FOR...TO...DO...END_FOR` - Count loops  
- `WHILE...DO...END_WHILE` - Conditional loops
- `CASE...OF...END_CASE` - Switch statements
- Assignment `:=` - Variable assignment
- Basic data types: `BOOL`, `INT`, `DINT`, `REAL`, `STRING`, `ARRAY`

**NOT Supporting (Yet):**
- Timers (TON, TOF, TP)
- Advanced FB calls with complex parameter passing
- Pointers and references
- Complex ARRAY operations
- User-defined enumerations

### LOT Side  
**Core Constructs We Support:**
- `DEFINE MODEL name` - Data models
- `DEFINE ACTION name` - Processing actions
- `DEFINE RULE name` - Conditional rules
- `ON TOPIC "pattern" DO` - Topic triggers
- `ON EVERY n SECONDS DO` - Time triggers  
- `SET "var" WITH expression` - Variable assignment
- `PUBLISH TOPIC "topic" WITH data` - Publishing
- `GET JSON "field" IN PAYLOAD` - JSON extraction
- `IF condition THEN...ELSE` - Conditionals
- `REPEAT...UNTIL` - Loops

## 2. Translation Mapping Table

| SCL Construct | LOT Equivalent | Round-Trip Quality |
|---------------|----------------|-------------------|
| `TYPE MyStruct : STRUCT` | `DEFINE MODEL MyStruct` | Perfect |
| `FUNCTION_BLOCK MyFB` | `DEFINE ACTION MyFB` | Perfect |
| `FUNCTION MyFunc : REAL` | `DEFINE RULE MyFunc` | Good (logic as comments) |
| `VAR_INPUT var : REAL;` | `SET "var" WITH (GET JSON "var"...)` | Perfect |
| `VAR_OUTPUT out : BOOL;` | `PUBLISH TOPIC "fb/output/out" WITH {out}` | Perfect |
| `variable := expression;` | `SET "variable" WITH (expression)` | Perfect |
| `IF condition THEN` | `IF (condition) THEN` | Perfect |
| `FOR i := 1 TO 10 DO` | `REPEAT...UNTIL ({i} > 10)` | Good |
| `WHILE condition DO` | `REPEAT...UNTIL (NOT condition)` | Good |

## 3. Examples for Testing

### Example 1: Simple Data Structure
**SCL:**
```scl
TYPE SensorData : 
STRUCT
    temperature : REAL;
    humidity : REAL;
    isValid : BOOL;
END_STRUCT
END_TYPE
```

**LOT:**
```lot
DEFINE MODEL SensorData
    ADD REAL "temperature"
    ADD REAL "humidity" 
    ADD BOOL "isValid"
```

### Example 2: Function Block with Logic
**SCL:**
```scl
FUNCTION_BLOCK PIDController
VAR_INPUT
    processValue : REAL;
    setPoint : REAL;
    enable : BOOL;
END_VAR

VAR_OUTPUT
    output : REAL;
    error : REAL;
END_VAR

VAR
    integral : REAL;
    lastError : REAL;
END_VAR

BEGIN
    IF enable THEN
        error := setPoint - processValue;
        integral := integral + error * 0.1;
        output := (error * 2.0) + (integral * 0.5);
        lastError := error;
    ELSE
        output := 0.0;
        integral := 0.0;
    END_IF;
END_FUNCTION_BLOCK
```

**LOT:**
```lot
DEFINE ACTION PIDController
ON TOPIC "plc/call/pidcontroller" DO
    SET "processValue" WITH (GET JSON "processValue" IN PAYLOAD AS REAL)
    SET "setPoint" WITH (GET JSON "setPoint" IN PAYLOAD AS REAL)
    SET "enable" WITH (GET JSON "enable" IN PAYLOAD AS BOOL)
    
    IF {enable} THEN
        SET "error" WITH ({setPoint} - {processValue})
        SET "integral" WITH ({integral} + {error} * 0.1)
        SET "output" WITH (({error} * 2.0) + ({integral} * 0.5))
        SET "lastError" WITH {error}
    ELSE
        SET "output" WITH 0.0
        SET "integral" WITH 0.0
    
    PUBLISH TOPIC "plc/output/pidcontroller/output" WITH {output}
    PUBLISH TOPIC "plc/output/pidcontroller/error" WITH {error}
```

### Example 3: Simple Function
**SCL:**
```scl
FUNCTION CalculateArea : REAL
VAR_INPUT
    length : REAL;
    width : REAL;
END_VAR

BEGIN
    CalculateArea := length * width;
END_FUNCTION
```

**LOT:**
```lot
DEFINE RULE CalculateArea
IF {length} IS NOT NULL AND {width} IS NOT NULL THEN
    SET "result" WITH ({length} * {width})
```

## 4. Implementation Phases

### Phase 1: Core IR and Simple Cases
- Build intermediate representation (IR)
- Implement STRUCT ↔ MODEL translation
- Basic FUNCTION_BLOCK ↔ ACTION translation
- Simple assignment statements

### Phase 2: Control Flow
- IF/THEN/ELSE statements
- FOR loops → REPEAT/UNTIL
- Variable scoping

### Phase 3: Advanced Features  
- Complex expressions
- Nested logic
- Error handling for unsupported constructs

### Phase 4: UI Integration
- Cell execution triggers translation
- Side-by-side view
- Error reporting
- Learning mode with explanations

## 5. Quality Targets

- **Perfect Round-Trip**: STRUCT, basic FB, simple assignments
- **Good Round-Trip**: Control flow, loops (minor syntax differences)
- **Degraded Round-Trip**: Complex logic → comments + approximate translation
- **No Translation**: Timers, advanced features → error message with explanation

## 6. Success Criteria

1. Control engineer writes SCL FUNCTION_BLOCK → sees equivalent LOT ACTION
2. SCL STRUCT → LOT MODEL with correct field types
3. SCL logic statements → LOT SET/IF statements with explanatory comments
4. Unsupported constructs → clear error messages explaining what's not supported
5. Round-trip: LOT → SCL → LOT preserves semantics for supported constructs