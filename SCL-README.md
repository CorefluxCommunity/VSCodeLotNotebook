# SCL (Simplified Configuration Language) to LOT Translator

This extension now includes support for **SCL (Simplified Configuration Language)** - a more user-friendly syntax that translates to the underlying LOT (Language of Things) format. SCL is designed to make it easier for automation customers to create and maintain IoT configurations.

## What is SCL?

SCL provides a simplified, human-readable syntax for defining:
- **Models**: Data structures for MQTT messages with automatic transformations
- **Actions**: Event-driven processing logic with triggers and conditions
- **Routes**: Database connection configurations
- **Rules**: Conditional logic for data processing

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

### Models
```scl
DEFINE MODEL MachineData WITH TOPIC "Simulator/Machine/+/Data"
    ADD "energy" WITH TOPIC "raw_data/+" AS TRIGGER
    ADD "device_name" WITH REPLACE "+" WITH TOPIC POSITION 2 IN "+"
    ADD "energy_wh" WITH (energy * 1000)
    ADD "production_status" WITH (IF energy > 5 THEN "active" ELSE "inactive")
    ADD "timestamp" WITH TIMESTAMP "UTC"
    STORE IN "mongo_route"
        WITH TABLE "MachineProductionData"
```

### Actions
```scl
DEFINE ACTION ProcessComponents
ON TOPIC "Raw/Components/+/+" DO
    SET "systemId" WITH (GET JSON "info" IN PAYLOAD AS STRING)
    SET "topicv" WITH ("Components/" + TOPIC POSITION 3 + "/" + TOPIC POSITION 4 + "/" + {systemId})
    
    PUBLISH MODEL KafkaMessage TO ({topicv}+"/Unit1") WITH
        componentId = (TOPIC POSITION 3 + "_" + TOPIC POSITION 4 + "_" + {systemId} + "_" + "Unit1")
        topic = ({topicv}+"/Unit1")
        payload = (GET JSON "Unit1" IN PAYLOAD AS STRING)
```

### Routes (Database Connections)
```scl
DEFINE ROUTE mongo_route WITH TYPE MONGODB
    ADD MONGODB_CONFIG
        WITH CONNECTION_STRING "mongodb+srv://username:password@cluster-uri/database"
        WITH DATABASE "admin"
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