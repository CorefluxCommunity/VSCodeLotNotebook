# SCL (Structured Control Language) Integration with LOT

This extension now includes support for **SCL (Structured Control Language)** - the standard PLC programming language defined in IEC 61131-3. This integration allows you to use real SCL syntax from industrial automation systems and interface it with your LOT (Language of Things) infrastructure.

## What is SCL?

SCL is the structured text language used in PLCs for defining:
- **STRUCT**: Data structures for organizing information
- **FUNCTION_BLOCK**: Reusable code blocks with inputs, outputs, and internal logic
- **FUNCTION**: Pure functions that calculate outputs from inputs
- **TYPE**: Custom data type definitions

## Key Features

### 🔄 Bidirectional Translation
- Convert SCL to LOT for execution
- Convert LOT back to SCL for easier editing
- Automatic syntax validation and formatting

### 🎯 User-Friendly Syntax
- Clear, readable structure
- Built-in data transformation functions
- Automatic database storage configuration
- Template-based model and action creation

### 🚀 Enhanced Productivity
- IntelliSense autocompletion
- Syntax highlighting
- Error validation
- Code formatting

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

### SCL Translation Commands
- **Convert SCL to LOT**: `scl.convertToLot` - Translates selected SCL cell to LOT
- **Convert LOT to SCL**: `scl.convertFromLot` - Translates selected LOT cell to SCL
- **Format SCL Code**: `scl.format` - Automatically formats SCL code with proper indentation
- **Validate SCL Syntax**: `scl.validate` - Checks SCL syntax for errors

### SCL Creation Commands
- **Create SCL Model**: `scl.createModel` - Creates a new SCL model template
- **Create SCL Action**: `scl.createAction` - Creates a new SCL action template

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