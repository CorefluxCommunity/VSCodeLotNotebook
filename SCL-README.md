# SCL (Structured Control Language) Integration with LOT

This extension now includes support for **SCL (Structured Control Language)** - the standard PLC programming language defined in IEC 61131-3. This integration allows you to use real SCL syntax from industrial automation systems and interface it with your LOT (Language of Things) infrastructure.

## What is SCL?

SCL is the structured text language used in PLCs for defining:
- **STRUCT**: Data structures for organizing information
- **FUNCTION_BLOCK**: Reusable code blocks with inputs, outputs, and internal logic
- **FUNCTION**: Pure functions that calculate outputs from inputs
- **TYPE**: Custom data type definitions

## Key Features

### 🎓 Learning Bridge for Control Engineers
- **Direct Translation**: See how your familiar SCL constructs map to LOT
- **Concept Mapping**: STRUCT → MODEL, FUNCTION_BLOCK → ACTION, FUNCTION → RULE
- **Logic Translation**: SCL assignments become LOT SET statements
- **I/O Mapping**: VAR_INPUT becomes JSON extraction, VAR_OUTPUT becomes PUBLISH

### 🔧 Professional Development Tools
- **Real SCL Syntax**: Industry-standard IEC 61131-3 constructs
- **IntelliSense Support**: Autocompletion for SCL keywords and data types
- **Syntax Highlighting**: Proper highlighting for PLC engineers
- **Template Library**: Common SCL patterns (STRUCT, FUNCTION_BLOCK, etc.)

### 🌉 Technology Bridge
- **From PLC to IoT**: Understand how control logic translates to IoT systems
- **Familiar to Modern**: Bridge traditional automation with modern data flows
- **Learning Tool**: Hands-on way to understand LOT concepts

## SCL Syntax Overview

### Data Structures (STRUCT)
```scl
TYPE SensorData :
STRUCT
    temperature : REAL;
    humidity : REAL;
    pressure : REAL;
    timestamp : DATE_AND_TIME;
    sensorId : STRING[50];
    isValid : BOOL;
END_STRUCT
END_TYPE
```

### Function Blocks
```scl
FUNCTION_BLOCK DataProcessor
VAR_INPUT
    mqttInput : MqttMessage;
    processEnable : BOOL;
    cycleTime : TIME;
END_VAR

VAR_OUTPUT
    processedData : SensorData;
    statusOutput : MachineStatus;
    errorFlag : BOOL;
    outputReady : BOOL;
END_VAR

VAR
    internalCounter : INT;
    tempValue : REAL;
END_VAR

BEGIN
    IF processEnable THEN
        tempValue := STRING_TO_REAL(mqttInput.payload);
        
        IF tempValue > 0.0 AND tempValue < 100.0 THEN
            processedData.temperature := tempValue;
            processedData.isValid := TRUE;
            processedData.timestamp := NOW();
            outputReady := TRUE;
        END_IF;
    END_IF;
END_FUNCTION_BLOCK
```

### Functions
```scl
FUNCTION CalculateEnergyConsumption : REAL
VAR_INPUT
    voltage : REAL;
    current : REAL;
    powerFactor : REAL;
    operatingTime : TIME;
END_VAR

VAR
    power : REAL;
    energyKwh : REAL;
END_VAR

BEGIN
    power := voltage * current * powerFactor;
    energyKwh := (power * TIME_TO_REAL(operatingTime)) / 3600000.0;
    CalculateEnergyConsumption := energyKwh;
END_FUNCTION
```

## Available Commands

### Learning Commands
- **Convert SCL to LOT**: `scl.convertToLot` - See how your SCL translates to LOT concepts
- **Convert LOT to SCL**: `scl.convertFromLot` - Understand LOT in terms of SCL
- **Format SCL Code**: `scl.format` - Properly format your SCL code
- **Validate SCL Syntax**: `scl.validate` - Check your SCL syntax

### Template Commands  
- **Create SCL STRUCT**: `scl.createModel` - Creates data structure templates
- **Create SCL FUNCTION_BLOCK**: `scl.createAction` - Creates function block templates

## Translation Mapping for Control Engineers

This table shows how your familiar SCL concepts directly translate to LOT:

| SCL Construct | LOT Equivalent | Purpose |
|---------------|----------------|---------|
| `TYPE name : STRUCT` | `DEFINE MODEL name` | Data structure definition |
| `FUNCTION_BLOCK name` | `DEFINE ACTION name` | Processing logic with I/O |
| `FUNCTION name : type` | `DEFINE RULE name` | Pure calculation function |
| `VAR_INPUT` | `SET "var" WITH (GET JSON...)` | Input parameter handling |
| `VAR_OUTPUT` | `PUBLISH TOPIC "..." WITH` | Output result publishing |
| `variable := expression;` | `SET "variable" WITH (expression)` | Variable assignment |
| `IF condition THEN` | `IF (condition) THEN` | Conditional logic |
| `FOR i := 1 TO 10 DO` | `REPEAT ... UNTIL` | Loop constructs |

### Example Translation:

**SCL Code (what you know):**
```scl
TYPE TankData : STRUCT
    level : REAL;
    temperature : REAL;
END_STRUCT
END_TYPE

FUNCTION_BLOCK PIDController
VAR_INPUT
    processValue : REAL;
    setPoint : REAL;
END_VAR
VAR_OUTPUT
    output : REAL;
END_VAR
BEGIN
    output := setPoint - processValue;
END_FUNCTION_BLOCK
```

**LOT Translation (what you'll learn):**
```lot
DEFINE MODEL TankData
    ADD NUMBER "level"     // SCL: level : REAL
    ADD NUMBER "temperature" // SCL: temperature : REAL

DEFINE ACTION PIDController
ON TOPIC "plc/call/pidcontroller" DO
    SET "processValue" WITH (GET JSON "processValue" IN PAYLOAD AS STRING)
    SET "setPoint" WITH (GET JSON "setPoint" IN PAYLOAD AS STRING)
    SET "output" WITH (setPoint - processValue)
    PUBLISH TOPIC "plc/output/pidcontroller/output" WITH {output}
```

## How to Use

### 1. Creating SCL Code
1. Open a LOT Notebook (`.lotnb` file)
2. Create a new code cell
3. Change the cell language to `scl`
4. Write your SCL configuration
5. Use Ctrl+Space for autocompletion

### 2. Converting SCL to LOT
1. Select a cell containing SCL code
2. Run the command: **Convert SCL to LOT**
3. A new LOT cell will be created with the translated code
4. Execute the LOT cell to deploy to your system

### 3. Converting LOT to SCL
1. Select a cell containing LOT code
2. Run the command: **Convert LOT to SCL**
3. A new SCL cell will be created with the simplified syntax

### 4. Using Templates
1. Use **Create SCL Model** or **Create SCL Action** commands
2. Fill in the prompted information
3. A new cell with the template will be created
4. Customize the template for your needs

## Data Types and Functions

### Supported Data Types
- `STRING`: Text data
- `OBJECT`: JSON objects
- `NUMBER`: Numeric values
- `BOOLEAN`: True/false values
- `ARRAY`: Lists of values

### Built-in Functions
- `GET JSON "field" IN PAYLOAD AS STRING`: Extract JSON field from payload
- `TIMESTAMP "UTC"`: Generate UTC timestamp
- `TOPIC POSITION n`: Extract topic segment at position n
- `REPLACE "+" WITH value IN "template"`: Replace wildcards in templates

### Database Types
- `MONGODB`: MongoDB databases
- `POSTGRESQL`: PostgreSQL databases
- `MYSQL`: MySQL databases
- `INFLUXDB`: InfluxDB time-series databases
- `TIMESCALEDB`: TimescaleDB databases

## Examples

Check the `examples/scl-demo.scl` file for comprehensive examples showing:
- Machine data processing with database storage
- Component payload processing with loops
- Sensor data aggregation
- Periodic data processing
- Database route configurations

## Advanced Features

### Conditional Logic
```scl
IF(condition) THEN
    action1
    action2
ELSE
    alternative_action
```

### Loops
```scl
REPEAT
    SET "counter" WITH {counter} + 1
    PUBLISH MODEL Data TO ("topic/" + {counter}) WITH
        value = {counter}
UNTIL ({counter} > 10)
```

### Database Storage
```scl
STORE IN "route_name"
    WITH TABLE "table_name"
```

### Multiple Triggers
```scl
ADD "temperature" WITH TOPIC "sensor/+/temperature" AS TRIGGER
ADD "humidity" WITH TOPIC "sensor/+/humidity" AS TRIGGER
```

## Error Handling

The SCL translator includes comprehensive error checking:
- Syntax validation before translation
- Clear error messages with line numbers
- Automatic formatting suggestions
- Real-time syntax highlighting

## Migration from LOT

If you have existing LOT code:
1. Select the LOT cell
2. Run **Convert LOT to SCL**
3. Review and edit the generated SCL code
4. Use the SCL syntax for future development

## Best Practices

1. **Use descriptive names** for models and actions
2. **Group related configurations** in the same notebook
3. **Add comments** using `--` for documentation
4. **Test with validation** before deploying
5. **Use templates** for consistent structure

## Troubleshooting

### Common Issues
- **Validation errors**: Check syntax against examples
- **Translation errors**: Ensure proper indentation
- **Missing fields**: Verify all required fields are defined

### Getting Help
- Use Ctrl+Space for autocompletion hints
- Check the syntax highlighting for errors
- Run validation before translation
- Review the examples for proper syntax

---

The SCL to LOT translator makes IoT configuration more accessible while maintaining the full power of the underlying LOT system. It's designed to help automation customers quickly create and maintain complex data processing workflows with a simplified, intuitive syntax.